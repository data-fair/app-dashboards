# DASHBOARDS-AGENTS

> Fichier de référence pour les agents IA qui construisent des configurations de dashboards sur l'app **`@data-fair/app-dashboards`** (v0.11) de l'écosystème DataFair.
>
> L'agent dispose d'un **connecteur MCP** pointant vers un portail DataFair. Ce connecteur lui sert principalement à **explorer les jeux de données** publiés sur le portail (schéma, types des champs, concepts, bbox, `timePeriod`, `isRest`, pièces jointes, etc.).
>
> **Le catalogue de visualisations n'est PAS exposé par le MCP.** C'est l'agent qui **propose** la ou les visualisations les plus pertinentes, à partir :
> - de la **question / intention** de l'utilisateur ;
> - de la **forme des jeux de données** disponibles sur le portail (renvoyée par le MCP).
>
> Ce fichier donne à l'agent :
> 1. les **règles de mapping question/intention → type de viz** ;
> 2. les **règles de mapping structure du dataset → visus compatibles** ;
> 3. un **catalogue de référence** des visus disponibles dans l'écosystème DataFair (URL type, données requises, cas d'usage), à utiliser quand l'utilisateur a confirmé la proposition ;
> 4. la **forme du JSON `DashboardConfig`** à produire, conforme à `public/config-schema.json`.

---

## 1. Workflow général de l'agent

```text
Question utilisateur
        │
        ▼
[1] Identifier l'intention (géographique ? temporelle ? comparative ? textuelle ? saisie ?)
        │
        ▼
[2] Via MCP, lister les datasets du portail et inspecter leur schéma :
    - champs `integer`/`number` / `string` / `date`
    - concepts (`lat_long`, `box`, `codeCommune`, `startDate`, `endDate`, `image`, …)
    - `bbox` présente
    - `timePeriod` présente
    - `isRest` / permissions
    - `attachments` / `attachmentsAsImage`
        │
        ▼
[3] Pour chaque dataset, **proposer** 1..N visus compatibles (cf. §3 et §4)
        │
        ▼
[4] Présenter les propositions à l'utilisateur (titre + cas d'usage)
        │
        ▼
[5] L'utilisateur valide / ajuste la sélection, fournit éventuellement :
    - le dataset racine (pour les filtres communs)
    - les dimensions d'analyse (filtres dynamiques)
        │
        ▼
[6] Construire le JSON `DashboardConfig` (cf. §2 et §6)
```

L'agent ne doit **pas** supposer qu'une visu est absente simplement parce qu'il ne l'a pas vue sur le portail : une visu peut être ajoutée par l'administrateur du portail à tout moment. L'agent s'appuie sur ce catalogue comme référence, puis l'utilisateur (ou un second passage de l'agent) confirme la disponibilité effective.

---

## 2. Anatomie d'un `DashboardConfig`

Le dashboard est un assemblage d'autres applications DataFair, organisé en **sections → lignes → éléments**. Les filtres du dashboard s'appliquent globalement à toutes les visus (sauf mention contraire).

```text
DashboardConfig
├── title, description            # Métadonnées globales
├── allowDuplicate                # Active le mode comparaison (2 colonnes côte-à-côte)
├── datasets[0]                   # ⚠️ Dataset source des filtres (obligatoire)
├── staticFilters[]               # Filtres figés (in / interval / nin)
├── filters[]                     # Filtres dynamiques (libellés déroulants)
├── periodFilter                  # Filtre temporel global
├── addressFilter                 # Filtre géographique par adresse
├── sections[]                    # Groupes thématiques
│   └── rows[]
│       ├── height                # Hauteur en px (négatif = auto)
│       └── elements[]
│           ├── title, width      # 1=Fin, 2=Moyen, 3=Large (défaut 2)
│           └── type              # application | tablePreview | text | form | column
├── sectionsGroup                 # accordion | tabs-tab | tabs-button | flow
├── showSources, showEmbed, showCapture
```

### 2.1 Types d'éléments (`elements[].type`)

| Type | Rôle | Source de données |
|------|------|-------------------|
| `application` | Embarque une visualisation DataFair | `application: {id, title, href, baseApp}` (du catalogue) |
| `tablePreview` | Prévisualisation tabulaire du dataset | `source: 'root'` (filtres) ou `'external'` (autre dataset) |
| `form` | Formulaire de saisie lié à un dataset éditable | `dataset: {...}` (REST, droit `createLine`) |
| `text` | Bloc de texte libre (markdown simple) | `content: string` |
| `column` | Colonne verticale qui contient d'autres éléments | `elements: []` (récursif) |

### 2.2 Sources de données

- **Source racine** (`source: 'root'`) : utilise le 1er dataset du dashboard (celui qui sert aux filtres). Recommandé quand la visu et les filtres doivent partager les mêmes données.
- **Source externe** (`source: 'external'`) : un autre dataset, généralement non filtré. Utile pour afficher une donnée de référence indépendante.

### 2.3 Filtres

- **Dynamiques** (`filters[]`) : listes déroulantes sur des champs du dataset racine, avec `labelField` (champ affiché) et `values` (champs pour les valeurs). `startValue` pour pré-remplir, `multipleValues` pour multi-sélection.
- **Statiques** (`staticFilters[]`) : `type: 'in'` (restreindre à valeurs), `'interval'` (min/max), `'nin'` (exclure valeurs). Ne s'affichent pas à l'utilisateur.
- **Globaux** : `periodFilter: true` (sélecteur de période sur `timePeriod`), `addressFilter: true` (saisie d'adresse).

#### 2.3.1 Transmission des filtres aux éléments : deux canaux distincts

Le dashboard propage les filtres aux éléments embarqués via **deux canaux distincts** selon le type d'élément. C'est une distinction essentielle à comprendre pour prédire le comportement d'une visu.

**Canal « embed dataset »** (éléments `tablePreview` et `form`)
- URL cible : `/data-fair/embed/dataset/<id>/table` ou `/data-fair/embed/dataset/<id>/form`.
- Les filtres dynamiques (`filters[]`) sont sérialisés dans l'URL avec un préfixe **dataset-scopé** : `<prefix>_d_<rootDatasetId>_<labelField>_in=...`. Ce format est attendu par l'API REST de l'embed dataset natif, qui sait à quel dataset appliquer la requête.
- Les static filters sont sérialisés sous la même forme : `<prefix>_d_<rootDatasetId>_<field>_in|_nin|_gte|_lte=...`.
- Les concepts universels (`_c_date_match`, `_c_geo_distance`, `finalizedAt`) sont également transmis.
- **Conséquence** : la visu reflète fidèlement les filtres du dashboard, mais elle partage le dataset racine (sinon le préfixe ne correspond pas).

**Canal « application »** (éléments `application`)
- URL cible : `/data-fair/app/<id>`.
- Seuls les paramètres **universellement reconnus** par les applications DataFair sont transmis dans l'URL :
  - `_c_date_match` (filtre temporel)
  - `_c_geo_distance` (filtre géographique)
  - `finalizedAt`
  - static filters **re-scopés** (sans préfixe dataset : `<field>_in=...`)
- Les filtres dynamiques `filters[]` ne sont **PAS** broadcastés dans l'URL : une application peut utiliser un dataset différent du dataset racine du dashboard, et un préfixe `_d_<rootDatasetId>_` serait sans signification pour elle.
- Les applications qui dépendent des filtres dynamiques doivent les recevoir via leur mécanisme de state-change d-frame (déclaré dans `df:filter-concepts`/`df:sync-state`) : la `<d-frame>` répercute l'évolution de l'URL vers l'iframe via `df-parent updateSrc`, et l'app résout les clés de filtre vers son propre dataset via ses concepts.
- **Conséquence** : les apps qui s'attendent à des clés dataset-préfixées doivent déclarer leurs concepts ; sinon, les filtres du dashboard ne les atteignent pas.

| Type d'élément | URL de l'embed | Préfixe des filtres dynamiques | Static filters | Concepts universels |
|----------------|----------------|------------------------------|----------------|---------------------|
| `tablePreview` | `/data-fair/embed/dataset/<id>/table` | `_d_<rootDatasetId>_` (présent) | préfixés | oui |
| `form` | `/data-fair/embed/dataset/<id>/form` | `_d_<rootDatasetId>_` (présent) | préfixés | oui |
| `application` | `/data-fair/app/<id>` | **absent** (géré via d-frame state) | re-scopés (non préfixés) | oui |

### 2.4 Modes d'affichage des sections

- `accordion` (défaut) : panneaux dépliables, tous ouverts par défaut
- `tabs-tab` : onglets (titre long → vertical)
- `tabs-button` : boutons de sélection
- `flow` : sections à la suite, sans interacteur

---

## 3. Proposer une viz à partir de l'intention

À partir de la question de l'utilisateur, suivre cet arbre. Pour chaque branche, voir ensuite la **fiche détaillée** dans le catalogue (§5) ou la **règle dataset → viz** (§4).

```text
La question est géographique / territoriale ?
├── Plusieurs couches à superposer      → Atelier cartographique
├── Densité / chaleur de points         → Carto stats
├── Points avec fiche détail            → Infos localisations
├── Jointure avec parcelles cadastrales → Infos parcelles
├── Comparer des zones (communes/EPCI)  → Zones de chalandise
└── Synthèse multi-sources territoriales → Infos territoires

La question est temporelle ?
├── Évolution sur la durée              → Séries temporelles
├── Comparer N séries périodiquement    → Periodic Series
├── Course animée de grandeurs          → Bar chart race
├── Plages de dates / événements        → Diagramme Timeline
├── Agenda / planning                   → Calendrier
└── Frise d'événements textuels         → Chronologie

La question compare des grandeurs ?
├── Comparaison multi-critères          → Graphique en radar
├── Hiérarchie / parts de marché        → Treemap
├── Hiérarchie circulaire               → Diagramme Sunburst
├── Proportions côte-à-côte             → Comparaison de proportions (waffle)
├── Flux entre catégories               → Diagramme Sankey
├── Tous types de graphiques            → Graphiques (barres, lignes, camemberts…)
└── KPI / chiffres clés                 → Métriques

La question est relationnelle / structurelle ?
├── Graphe nœuds-liens                  → Graphes / Réseaux
├── Réseau avec types de relations      → Réseau de relations
└── Flux / échanges entre paires        → Diagramme Chord

La question porte sur un texte / du vocabulaire ?
├── Mots-clés d'un corpus               → Nuages de mots
├── Liste d'items avec recherche+fiche  → Liste et fiches
├── Vue tabulaire dense et filtrable    → Tableau synthétique
├── Vue tabulaire simple                → Simple Table
└── Galerie d'images                    → Diaporama

L'utilisateur veut saisir / contribuer ?
├── Formulaire public                   → Formulaire de saisie
└── Workflow de contribution            → Contributions collaboratives

L'utilisateur veut montrer qu'un sous-dashboard existe déjà ?
└── Embarquer un dashboard existant     → Dashboards (récursivité)
```

### 3.1 Formulations utilisateur → branches typiques

| L'utilisateur dit… | Branche probable |
|--------------------|------------------|
| « sur une carte », « localiser », « sur le territoire » | Géographique |
| « évolution », « tendance », « au fil du temps », « depuis X années » | Temporelle |
| « comparer », « versus », « par rapport à » | Comparative |
| « répartition », « parts », « qui sont les plus » | Hiérarchique / proportions |
| « réseau », « relations », « liens entre » | Relationnelle |
| « liste », « annuaire », « moteur de recherche » | Textuelle (liste et fiches) |
| « tableau », « tableau de bord synthétique » | Textuelle (table) |
| « mots-clés », « termes les plus fréquents » | Textuelle (nuage) |
| « formulaire », « faire remonter », « saisir » | Saisie |
| « frise », « chronologie » | Temporelle (timeline/chronologie) |
| « KPIs », « chiffres clés », « tête de gondole » | Métriques |
| « course », « animé » | Bar chart race |

---

## 4. Proposer une viz à partir de la structure du dataset

Quand l'agent a récupéré le schéma d'un dataset (via MCP), il peut inférer des visus pertinentes **sans même connaître la question**. C'est utile pour suggérer un point de départ à l'utilisateur.

### 4.1 Règles de matching dataset → visus candidates

```text
SI le dataset contient un champ de concept géométrique (geojson / Geometry)
   ├─ SI un seul dataset, sans notion de calque
   │  ├─ SI volumineux (>10k lignes)         → Carto stats
   │  └─ SINON                                → Infos localisations (+ fiche)
   └─ SI plusieurs datasets géo à superposer  → Atelier cartographique
      OU (si concept `codeCommune`/`EPCI`/IRIS) → Infos territoires

SI le dataset contient un champ avec concept `codeLandRegistry`
   → Infos parcelles (jointure cadastre)

SI le dataset contient un champ avec concept `codeCommune`/`codeDepartement`/`codeRegion`/`EPCI`/`codeIRIS`
   → Zones de chalandise (+ jointure administrative)

SI le dataset contient au moins un champ integer/number
   ├─ ET un champ date / startDate            → Séries temporelles
   ├─ ET un champ startDate ET endDate        → Diagramme Timeline
   ├─ ET au moins 3 champs numériques         → Graphique en radar
   ├─ ET un champ catégoriel                  → Graphiques (multi-types)
   │                                            + Métriques (KPI)
   │                                            + Comparaison de proportions
   ├─ ET une hiérarchie de catégories         → Treemap ou Sunburst
   ├─ ET des paires source→cible (typées)     → Réseau de relations / Graphes
   └─ SINON (juste des nombres)               → Métriques

SI le dataset contient un champ `string` long
   → Nuages de mots (et Liste et fiches pour l'exploration)

SI le dataset contient un champ avec concept `image`
   → Diaporama (et Liste et fiches avec vignette)

SI le dataset a `isRest: true`
   ├─ ET droit `createLine` seul              → Formulaire de saisie
   └─ ET droits `readLines`+`createLine`+`sendUserNotification`
                                              → Contributions collaboratives

SI le dataset a `attachmentsAsImage: true`
   → Liste et fiches (avec vignette)

SI le dataset a un `timePeriod`
   → activer `periodFilter: true` (filtre temporel global)
   → candidats temporels : Séries / Periodic Series / Bar chart race / Timeline / Calendrier

SI le dataset a une `bbox`
   → activer éventuellement `addressFilter: true` (filtre par adresse)
```

### 4.2 Quand l'agent a plusieurs datasets, comment articuler

- **1 dataset principal + 1..N datasets de référence** : le principal devient `datasets[0]` (filtres), les autres sont utilisés via `source: 'external'` (non filtrés) pour afficher des données de contexte.
- **Plusieurs datasets au même niveau** : pas de filtres globaux, chaque visu utilise `source: 'external'` avec son propre dataset. Préférer alors des sections `tabs-tab` ou `flow`.
- **1 dataset numérique + 1 dataset de référentiel géographique** (ex. communes) : la carte se base sur le référentiel (source externe), les graphes sur le dataset numérique (source racine).

---

## 5. Catalogue de référence des visualisations

> 32 visus publiques dédupliquées, classées par catégorie officielle du portail. Ce catalogue sert de **référence** pour les propositions, pas de liste exhaustive des visus effectivement disponibles sur le portail (qui peut varier).

### 5.1 Vue d'ensemble par catégorie

#### Essentiel (8)

| Visu | Données requises | Cas d'usage |
|------|------------------|-------------|
| [Atelier cartographique](#atelier-cartographique) | Datasets géo (`bbox=true`) | Carte multi-couches |
| [Graphiques](#graphiques) | Dataset numérique (`integer`/`number`) | Tous types de graphes |
| [Métriques](#métriques) | Dataset numérique | KPI / chiffres clés |
| [Liste et fiches](#liste-et-fiches) | Dataset avec `attachmentsAsImage` | Moteur de recherche + fiches |
| [Dashboards](#dashboards) | n/a (c'est l'app elle-même) | Embarquer un sous-dashboard |
| [Calendrier](#calendrier) | Dataset avec `startDate`/`endDate` | Vue calendrier |
| [Comparaison de proportions](#comparaison-de-proportions) | Dataset numérique | Waffle / grille |
| [Infos territoires](#infos-territoires) | Datasets géo multi-thèmes | Carte choroplèthe + jointures |

#### Carte (4)

| Visu | Données requises | Cas d'usage |
|------|------------------|-------------|
| [Carto stats](#carto-stats) | Dataset géo `bbox=true` | Densité / heatmap |
| [Infos localisations](#infos-localisations) | Dataset géo | Points avec fiche détail |
| [Infos parcelles](#infos-parcelles) | Dataset avec `codeLandRegistry` | Cadastre français |
| [Zones de chalandise](#zones-de-chalandise) | Dataset avec `codeCommune`/`codeDepartement`… | Zones d'attraction |

#### Graphique (10)

| Visu | Données requises | Cas d'usage |
|------|------------------|-------------|
| [Séries temporelles](#series-temporelles) | Dataset numérique + date | Courbes dans le temps |
| [Periodic Series](#periodic-series) | Dataset numérique + `startDate`/`endDate` | Comparaison périodique |
| [Bar chart race](#bar-chart-race) | Dataset numérique + date | Course de barres animée |
| [Diagramme Timeline](#diagramme-timeline) | Dataset avec `startDate`/`endDate` | Plages temporelles |
| [Diagramme Sankey](#diagramme-de-sankey) | Dataset numérique | Flux entre catégories |
| [Diagramme Sunburst](#diagramme-sunburst) | Dataset numérique | Hiérarchie circulaire |
| [Treemap](#treemap) | Dataset numérique | Hiérarchie en rectangles |
| [Graphique en radar](#graphique-en-radar) | Dataset numérique | Comparaison multi-critères |
| [Graphes / Réseaux](#graphes-reseaux) | 2 datasets numériques | Graphe nœuds-liens |
| [Réseau de relations](#reseau-de-relations) | Dataset numérique | Réseau typé |

#### Textuel (7)

| Visu | Données requises | Cas d'usage |
|------|------------------|-------------|
| [Tableau synthétique](#tableau-synthetique) | Dataset | Vue agrégée |
| [Simple Table](#simple-table) | Dataset numérique | Tableau avec filtres |
| [Formulaire de saisie](#formulaire-de-saisie) | Dataset REST (`createLine`) | Saisie publique |
| [Contributions collaboratives](#contributions-collaboratives) | Dataset REST (`readLines`+`createLine`) | Workflow de contribution |
| [Chronologie](#chronologie) | Dataset avec date | Frise textuelle |
| [Nuages de mots](#nuages-de-mots) | Dataset avec champ `string` | Visualisation lexicale |
| [Quiz](#quiz) | Dataset numérique + pièces jointes | Jeu d'association |

#### Autre (3)

| Visu | Données requises | Cas d'usage |
|------|------------------|-------------|
| [Diaporama](#diaporama) | Dataset avec concept `image` | Carrousel d'images |
| [Jeu de tri](#jeu-de-tri) | Dataset numérique + pièces jointes | Mini-jeu de tri |
| [Météo de l'électricité](#meteo-de-lelectricite) | Dataset temporel | Indicateurs temps réel |

#### Jeu (1)

| Visu | Données requises | Cas d'usage |
|------|------------------|-------------|
| [Jeu de localisation](#jeu-de-localisation) | Dataset numérique | Deviner sur une carte aveugle |

---

### 5.2 Fiches détaillées des visus

> Pour les visus non détaillées ici, l'agent doit quand même pouvoir les proposer ; l'utilisateur final ira configurer les paramètres avancés dans l'UI du portail.

<a id="atelier-cartographique"></a>
#### Atelier cartographique
- **Titre portail** : Atelier cartographique
- **URL type** : `/apps/atelier-carto/<version>/`
- **Catégorie** : essentiel / carte
- **Description** : Visualiser sur une même carte plusieurs sources de données géographiques (multi-calques).
- **Dataset requis** : un ou plusieurs datasets géographiques (`bbox=true`, `schema` avec `geojson` ou géométries WKT/WKB). Le filtre par concepts (`lat_long`, `box`) est recommandé.
- **Cas d'usage** : Tableau de bord territorial combinant plusieurs couches (communes, EPCI, IRIS, parcelles, points d'intérêt).
- **Concepts acceptés** : `https://schema.org/box`
- **Sync** : `df:overflow: false`, `df:sync-state: true`, `df:sync-config: true`

<a id="graphiques"></a>
#### Graphiques
- **Titre portail** : Graphiques / Charts
- **URL type** : `/apps/app-charts/<version>/` ou `https://cdn.jsdelivr.net/npm/@data-fair/app-charts@<version>/dist/`
- **Catégorie** : essentiel / graphique
- **Description** : Visualisation générique de données numériques (barres, lignes, aires, camemberts, nuages de points…). La plus polyvalente pour les graphes statistiques.
- **Dataset requis** : n'importe quel dataset (de préférence avec champs `integer` ou `number`). Aucune exigence de concept.
- **Cas d'usage** : Barres groupées, courbes multi-séries, secteurs, etc. Par défaut pour toute viz numérique « standard ».
- **Concepts** : `rdfs:label` acceptés, `lat_long` requis pour certaines visus (géo).
- **Sync** : `df:sync-state: true`, `df:sync-config: true`, `df:vjsf: 3`

<a id="metriques"></a>
#### Métriques
- **Titre portail** : Métriques
- **URL type** : `/apps/metrics/<version>/`
- **Catégorie** : essentiel / textuel (affichage de chiffres)
- **Description** : Visualiser des métriques/KPI de haut niveau sur un dataset : compteur principal, sparkline, comparaison, jauge.
- **Dataset requis** : dataset avec champs numériques (`integer`/`number`).
- **Cas d'usage** : Page d'accueil d'un dashboard affichant les indicateurs clés (total, moyenne, dernière valeur, etc.).
- **Sync** : `df:sync-state: true`, `df:filter-concepts: true`, `df:sync-config: true`, `df:vjsf: 3`

<a id="liste-et-fiches"></a>
#### Liste et fiches
- **Titre portail** : Liste et fiches
- **URL type** : `/apps/list-details/<version>/`
- **Catégorie** : essentiel / textuel
- **Description** : Mini moteur de recherche multicritère avec fiche détaillée par élément. Le plus utilisé pour les annuaires/registres.
- **Dataset requis** : dataset avec `schema` (pour configurer les champs de la fiche), idéalement `attachmentsAsImage` pour avoir une vignette. `count` recommandé pour la pagination.
- **Cas d'usage** : Annuaires d'entreprises, d'équipements, de délibérations, de personnes. Toute liste consultable.
- **Sync** : `df:sync-state: true`, `df:filter-concepts: true`, `df:vjsf: 3`

<a id="dashboards"></a>
#### Dashboards (récursivité)
- **Titre portail** : Dashboards
- **URL type** : `https://cdn.jsdelivr.net/npm/@data-fair/app-dashboards@<version>/dist/`
- **Catégorie** : essentiel
- **Description** : Cette application est l'app **elle-même** : elle peut être imbriquée pour composer un dashboard dans un dashboard (un sous-dashboard complet dans une case).
- **Cas d'usage** : Découper un grand dashboard en blocs autonomes, ou réutiliser un dashboard existant comme brique.

<a id="calendrier"></a>
#### Calendrier
- **Titre portail** : Calendrier
- **URL type** : `https://cdn.jsdelivr.net/npm/@data-fair/app-calendar@<version>/dist/`
- **Catégorie** : essentiel / textuel
- **Description** : Visualisation de données sous forme de calendrier (jour/semaine/mois) avec événements positionnés par date.
- **Dataset requis** : dataset avec concept `date` ou champs `startDate`/`endDate`. Compatible avec `timePeriod` pour le filtre global.
- **Cas d'usage** : Planning d'événements, calendrier de publication, agenda de collectes.
- **Sync** : `df:sync-state: true`, `df:filter-concepts: true`, `df:overflow: true`

<a id="comparaison-de-proportions"></a>
#### Comparaison de proportions
- **Titre portail** : Comparaison de proportions
- **URL type** : `/apps/data-fair-proportions/<version>/`
- **Catégorie** : essentiel / graphique
- **Description** : Comparer visuellement des proportions sous forme de grille waffle (1000 cellules colorées). Plus lisible qu'un camembert pour comparer plusieurs ensembles.
- **Dataset requis** : dataset avec champs `integer` ou `number` (≥ 2 valeurs à comparer).
- **Cas d'usage** : Comparer la répartition hommes/femmes, urbain/rural, par CSP, etc. entre plusieurs territoires ou périodes.
- **Sync** : `df:sync-state: true`, `df:filter-concepts: true`, `df:vjsf: 3`

<a id="infos-territoires"></a>
#### Infos territoires
- **Titre portail** : Infos territoires
- **URL type** : `/apps/infos-territoires/<version>/`
- **Catégorie** : essentiel / carte
- **Description** : Visualiser sur une même carte des informations sur les territoires depuis **plusieurs sources de données** + jointure automatique avec les contours administratifs (communes, EPCI, départements, régions).
- **Dataset requis** : un ou plusieurs datasets avec `schema` (jointure via code INSEE) et `bbox`. Le portail injecte les fonds de carte.
- **Cas d'usage** : Indicateurs socio-économiques par commune, par EPCI, par département.
- **Concepts** : géométries `geojson` ou `Geometry` (IGN).
- **Sync** : `df:sync-state: true`, `df:filter-concepts: true`, `df:vjsf: 3`

<a id="carto-stats"></a>
#### Carto stats
- **Titre portail** : Carto stats
- **URL type** : `/apps/carto-stats/<version>/`
- **Catégorie** : carte
- **Description** : Visualiser un grand nombre d'informations spatiales sous forme agrégée (densité de points, clusters, statistiques par zone).
- **Dataset requis** : dataset géographique (`bbox=true`), potentiellement volumineux.
- **Cas d'usage** : Cartes de chaleur de plus de 10 000 points, statistiques par carreau/IRIS.
- **Concepts** : `https://schema.org/box`

<a id="infos-localisations"></a>
#### Infos localisations
- **Titre portail** : Infos localisations
- **URL type** : `/apps/infos-loc/<version>/`
- **Catégorie** : carte
- **Description** : Visualiser des informations géolocalisées sur une fiche configurable (caractéristique par caractéristique).
- **Dataset requis** : dataset géographique avec `schema`. Chaque ligne devient un point sur la carte + une fiche.
- **Cas d'usage** : Points d'intérêt, équipements, agences, avec fiche descriptive par point.
- **Sync** : `df:sync-state: true`, `df:filter-concepts: true`

<a id="infos-parcelles"></a>
#### Infos parcelles
- **Titre portail** : Infos parcelles
- **URL type** : `/apps/infos-parcelles/<version>/`
- **Catégorie** : carte
- **Description** : Visualiser des informations additionnelles sur certaines parcelles du cadastre français et les mettre en évidence sur le plan.
- **Dataset requis** : dataset avec un champ de concept `codeLandRegistry` (identifiant de parcelle). Jointure automatique avec le plan cadastral.
- **Cas d'usage** : Données foncières, transactions, zones à risque par parcelle.

<a id="zones-de-chalandise"></a>
#### Zones de chalandise
- **Titre portail** : Zones de chalandise
- **URL type** : `/apps/admin-divs-catchment/<version>/`
- **Catégorie** : carte
- **Description** : Afficher des zones de chalandise basées sur les divisions administratives (communes, EPCI, départements, IRIS).
- **Dataset requis** : dataset avec un champ de concept parmi `codeCommune`, `codeDepartement`, `codeRegion`, `EtablissementPublicDeCooperationIntercommunale`, `codeIRIS`.
- **Cas d'usage** : Aires d'attraction d'un commerce, périmètre d'un service public.

<a id="series-temporelles"></a>
#### Séries temporelles
- **Titre portail** : Séries temporelles
- **URL type** : `/apps/data-fair-series/<version>/`
- **Catégorie** : graphique
- **Description** : Visualiser des séries de données chiffrées dans le temps (lignes, aires, barres).
- **Dataset requis** : dataset avec un champ `integer`/`number` ET un champ date (concept `date` ou `startDate`/`endDate`).
- **Cas d'usage** : Évolutions mensuelles/annuelles, comparaisons inter-années, tendances long terme.
- **Sync** : `df:sync-state: true`, `df:filter-concepts: true`, `df:vjsf: 3`

<a id="periodic-series"></a>
#### Periodic Series
- **Titre portail** : Periodic Series
- **URL type** : `/apps/periodic-series/<version>/`
- **Catégorie** : graphique
- **Description** : Visualiser une série de données en mettant en évidence sa **périodicité** (par exemple comparer la même semaine sur plusieurs années).
- **Dataset requis** : dataset numérique avec un champ date (`Date` ou `startDate`/`endDate`).
- **Cas d'usage** : Saisonnalité d'un indicateur, comparaison N périodes glissantes.

<a id="bar-chart-race"></a>
#### Bar chart race
- **Titre portail** : Bar chart race
- **URL type** : `/apps/bar-chart-race/<version>/`
- **Catégorie** : graphique
- **Description** : Comparaison animée entre grandeurs au cours du temps (course de barres horizontales).
- **Dataset requis** : dataset avec un champ numérique + un champ date.
- **Cas d'usage** : Animations de classements type « top 10 des régions par population de 1960 à 2024 ».

<a id="diagramme-timeline"></a>
#### Diagramme Timeline
- **Titre portail** : Diagramme Timeline
- **URL type** : `/apps/timelines-chart/<version>/`
- **Catégorie** : graphique
- **Description** : Visualiser des **plages temporelles** (début/fin) sur une frise chronologique.
- **Dataset requis** : dataset avec champs de concept `startDate` ET `endDate`.
- **Cas d'usage** : Projets, mandats, durées de vie, périodes d'activité.
- **Sync** : `df:sync-state: true`, `df:filter-concepts: true`, `df:vjsf: 3`

<a id="diagramme-de-sankey"></a>
#### Diagramme de Sankey
- **Titre portail** : Diagramme de Sankey
- **URL type** : `/apps/sankey/<version>/`
- **Catégorie** : graphique
- **Description** : Visualiser des **flux** et proportions entre différentes catégories (origine → destination).
- **Dataset requis** : dataset avec champs numériques et catégoriels.
- **Cas d'usage** : Parcours de formation, flux migratoires, budgets entre ministères.
- **Sync** : `df:sync-state: true`, `df:filter-concepts: true`, `df:vjsf: 3`

<a id="diagramme-sunburst"></a>
#### Diagramme Sunburst
- **Titre portail** : Diagramme Sunburst
- **URL type** : `/apps/sunburst/<version>/`
- **Catégorie** : graphique
- **Description** : Visualiser des informations **hiérarchiques** sous forme de cercles concentriques.
- **Dataset requis** : dataset numérique avec champs catégoriels emboîtés.
- **Cas d'usage** : Répartition par catégorie → sous-catégorie → sous-sous-catégorie.
- **Sync** : `df:sync-state: true`, `df:filter-concepts: true`, `df:vjsf: 3`

<a id="treemap"></a>
#### Treemap
- **Titre portail** : Treemap
- **URL type** : `/apps/app-treemap/<version>/`
- **Catégorie** : graphique
- **Description** : Visualiser des informations **hiérarchiques** sous forme de rectangles emboîtés.
- **Dataset requis** : dataset avec champs catégoriels et numériques.
- **Cas d'usage** : Parts de marché par groupe → sous-groupe, budget par programme → action.
- **Sync** : `df:sync-state: true`, `df:filter-concepts: true`

<a id="graphique-en-radar"></a>
#### Graphique en radar
- **Titre portail** : Graphique en radar
- **URL type** : `/apps/data-fair-radar/<version>/`
- **Catégorie** : graphique
- **Description** : Comparer des éléments sur **plusieurs critères** en étoile (axes multiples).
- **Dataset requis** : dataset avec ≥ 3 champs numériques (axes) et un champ identifiant d'élément.
- **Cas d'usage** : Comparer des communes sur N indicateurs, profils multi-dimensionnels.

<a id="graphes-reseaux"></a>
#### Graphes / Réseaux
- **Titre portail** : Graphes / Réseaux
- **URL type** : `/apps/data-fair-networks/<version>/`
- **Catégorie** : graphique
- **Description** : Visualiser des **réseaux** sous forme de graphe nœuds-liens.
- **Dataset requis** : 2 datasets numériques (nœuds + liens, ou nœuds et relations).
- **Cas d'usage** : Réseaux sociaux, graphes de collaborations, chaînes de sous-traitance.

<a id="reseau-de-relations"></a>
#### Réseau de relations
- **Titre portail** : Réseau de relations
- **URL type** : `/apps/data-fair-relations/<version>/`
- **Catégorie** : graphique
- **Description** : Visualiser un **réseau de relations typées** (nœuds colorés par type, liens colorés par type de relation).
- **Dataset requis** : dataset numérique représentant des paires (source, cible, type, poids).
- **Cas d'usage** : Relations entre entreprises, écosystèmes d'acteurs, graphes d'interactions.

<a id="tableau-synthetique"></a>
#### Tableau synthétique
- **Titre portail** : Tableau synthétique
- **URL type** : `/apps/data-fair-table/<version>/`
- **Catégorie** : textuel
- **Description** : Vue agrégée et compacte des données en tableau (groupements et sommes configurables).
- **Dataset requis** : n'importe quel dataset.
- **Cas d'usage** : Tableau de synthèse croisant dimensions et mesures.

<a id="simple-table"></a>
#### Simple Table
- **Titre portail** : Simple Table
- **URL type** : `/apps/app-table/<version>/`
- **Catégorie** : textuel
- **Description** : Vue tabulaire simple limitée à certaines colonnes avec filtres de colonnes.
- **Dataset requis** : dataset numérique (de préférence).
- **Cas d'usage** : Affichage tabulaire rapide avec recherche et filtres en en-tête.

<a id="formulaire-de-saisie"></a>
#### Formulaire de saisie
- **Titre portail** : Formulaire de saisie
- **URL type** : `https://cdn.jsdelivr.net/npm/@data-fair/app-form@<version>/dist/`
- **Catégorie** : textuel
- **Description** : Formulaire public permettant à n'importe quel visiteur de saisir une nouvelle ligne dans un dataset éditable.
- **Dataset requis** : dataset **REST** (`rest: true`) avec droit `createLine` pour la clé d'application.
- **Cas d'usage** : Signalements, inscriptions, déclarations en libre service.

<a id="contributions-collaboratives"></a>
#### Contributions collaboratives
- **Titre portail** : Contributions collaboratives
- **URL type** : `/apps/contribs/<version>/`
- **Catégorie** : textuel
- **Description** : Gestion de contributions dans un dataset incrémental : affichage des contributions existantes + formulaire d'ajout.
- **Dataset requis** : dataset REST avec droits `readLines` + `createLine` + `sendUserNotification`.
- **Cas d'usage** : Open data participative, crowdsourcing d'informations locales, wiki de quartier.
- **Sync** : `df:sync-state: true`, `df:filter-concepts: true`, `df:sync-config: true`, `df:vjsf: 3`

<a id="chronologie"></a>
#### Chronologie
- **Titre portail** : Chronologie
- **URL type** : `/apps/app-timelines/<version>/`
- **Catégorie** : textuel
- **Description** : Frise chronologique listant des événements textuels datés (type « il était une fois »).
- **Dataset requis** : dataset avec un champ date (concept `date`/`startDate`) et un champ texte.
- **Cas d'usage** : Histoire d'une organisation, grandes étapes d'un projet.

<a id="nuages-de-mots"></a>
#### Nuages de mots
- **Titre portail** : Nuages de mots
- **URL type** : `/apps/word-cloud/<version>/`
- **Catégorie** : textuel
- **Description** : Visualisation lexicale d'un champ textuel (fréquences de mots).
- **Dataset requis** : dataset avec au moins un champ de type `string` (idéalement long).
- **Cas d'usage** : Analyse d'un champ libre, verbatims, titres, descriptions.

<a id="quiz"></a>
#### Quiz
- **Titre portail** : Quiz
- **URL type** : `/apps/data-fair-quizz/<version>/`
- **Catégorie** : textuel / jeu
- **Description** : Mini-jeu d'association libellés/description ou libellés/images.
- **Dataset requis** : dataset avec pièces jointes (`attachments`).
- **Cas d'usage** : Pédagogie, sensibilisation, révision.

<a id="diaporama"></a>
#### Diaporama
- **Titre portail** : Diaporama
- **URL type** : `https://cdn.jsdelivr.net/npm/@data-fair/app-carousel@<version>/dist/`
- **Catégorie** : autre
- **Description** : Carrousel d'images avec défilement.
- **Dataset requis** : dataset avec concept `image` (`http://schema.org/image`).
- **Cas d'usage** : Galerie photo, mise en avant d'images.

<a id="jeu-de-tri"></a>
#### Jeu de tri
- **Titre portail** : Jeu de tri
- **URL type** : `/apps/data-fair-sort-game/<version>/`
- **Catégorie** : autre
- **Description** : Mini-jeu de tri aveugle (l'utilisateur devine l'ordre).
- **Dataset requis** : dataset numérique avec pièces jointes.
- **Cas d'usage** : Pédagogie par le jeu, sensibilisation.

<a id="meteo-de-lelectricite"></a>
#### Météo de l'électricité
- **Titre portail** : Météo de l'électricité
- **URL type** : `/apps/eco-watt/<version>/`
- **Catégorie** : autre
- **Description** : Widget de météo de l'électricité (signaux EcoWatt en temps réel ou similaire).
- **Dataset requis** : dataset temporel (statut `indexed` ou `updated` autorisé).
- **Cas d'usage** : Indicateurs temps réel sur la consommation électrique.
- **Sync** : `df:sync-state: true`, `df:filter-concepts: true`, `df:sync-config: true`, `df:vjsf: 3`

<a id="jeu-de-localisation"></a>
#### Jeu de localisation
- **Titre portail** : Jeu de localisation
- **URL type** : `/apps/data-fair-locate-game/<version>/`
- **Catégorie** : jeu
- **Description** : Mini-jeu : deviner la position d'un point sur une carte aveugle.
- **Dataset requis** : dataset numérique (les valeurs servent au scoring).
- **Cas d'usage** : Pédagogie, sensibilisation géographique.

---

## 6. Construction pas-à-pas du `DashboardConfig`

### Étape 1 — Identifier les jeux de données
Via MCP, lister les datasets du portail qui correspondent à la question. Pour chaque dataset, récupérer `id`, `title`, `href`, `schema` (avec `key`, `label`, `type`, `concept`), `bbox`, `timePeriod`, `isRest`, `attachments`.

### Étape 2 — Choisir le dataset racine (filtres communs)
Le **premier élément** de `datasets[]` est la source des filtres. Critères de choix :
- Il alimente le plus de visus du dashboard
- Il a des champs de **libellé** (`label`) et de **concept** clairs
- Il a un `timePeriod` (pour activer `periodFilter`)
- Il a une `bbox` (pour activer les filtres géo)

### Étape 3 — Définir les filtres
- Pour chaque dimension d'analyse importante, créer une entrée `filters[]` avec :
  - `labelField` : le champ du dataset racine à utiliser comme libellé
  - `values` : optionnel, les champs pour les valeurs
  - `startValue` : valeur initiale (si pertinent)
  - `multipleValues` : `true` si l'utilisateur doit pouvoir cocher plusieurs valeurs
- Ajouter `periodFilter: true` si le dataset a un `timePeriod`
- Ajouter `addressFilter: true` pour filtrer par adresse
- Pour des contraintes invisibles, utiliser `staticFilters[]`

### Étape 4 — Référencer les applications dans les éléments
Pour chaque élément de type `application`, l'agent doit fournir un objet `application` complet, récupéré via MCP sur le portail ou déduit du catalogue :

```jsonc
{
  "type": "application",
  "title": "Carte des installations",
  "width": 3,
  "application": {
    "id": "<id base-app retourné par MCP>",
    "title": "Atelier cartographique",
    "href": "<URL de la base-app>",
    "baseApp": { "meta": { /* métadonnées portail */ } }
  }
}
```

> **Note** : si l'utilisateur n'a pas encore confirmé la disponibilité de la viz sur le portail, l'agent peut soit (a) consulter la liste des applications installées via l'API du portail, soit (b) demander confirmation à l'utilisateur avant d'écrire la config.

### Étape 5 — Regrouper les visus en sections
Une `section` = un thème ou une étape du récit. Pour chaque section :
- Donner un `title` court
- Choisir une `icon` (svg MDI, via le sélecteur intégré)
- Ajouter 1..N `rows[]` avec :
  - `height` : hauteur en px (négatif = ajustement automatique au contenu)
  - `elements[]` : les visus, dans l'ordre de lecture
    - `width` : 1 (fin), 2 (moyen, défaut) ou 3 (large)
    - Pour les visus qui exigent qu'un filtre soit actif : `valueMandatory: true` + `mandatoryFilters: [<labelField du filtre>]`

### Étape 6 — Choisir le mode d'affichage global
- `accordion` (défaut) : page longue, tout déplié
- `tabs-tab` : 2–6 sections, titres courts
- `tabs-button` : 2–4 sections, sélection visible
- `flow` : succession sans interacteur (rendu éditorial)

### Étape 7 — Options globales
- `title` + `description` : introduction
- `allowDuplicate: true` : active le mode comparaison (l'utilisateur duplique tous les filtres)
- `showSources: true` : affiche les liens vers les sources de données
- `showEmbed: true` : bouton d'intégration
- `showCapture: true` : bouton d'export

---

## 7. Annexe — Mapping champ du dataset → visus compatibles

| Caractéristique du dataset | Visus compatibles |
|---------------------------|-------------------|
| Champ `integer` ou `number` | Graphiques, Métriques, Séries temporelles, Periodic Series, Bar chart race, Sankey, Sunburst, Treemap, Radar, Waffle, Graphes/Réseaux, Réseau de relations, Quiz, Jeu de tri, Jeu de localisation, Tableau synthétique, Simple Table |
| Champ `bbox` (géométrie) | Atelier cartographique, Carto stats, Infos localisations, Infos territoires |
| Concept `box` ou `lat_long` | Toutes les visus carto |
| Concept `codeLandRegistry` | Infos parcelles |
| Concepts `codeCommune`/`codeDepartement`/`codeRegion`/`EPCI`/`codeIRIS` | Zones de chalandise, Infos territoires |
| Champ `date` ou concepts `startDate`/`endDate` | Calendrier, Chronologie, Séries temporelles, Periodic Series, Bar chart race, Diagramme Timeline |
| `timePeriod` présent | Active `periodFilter` (sélecteur global) |
| Champ `string` (texte) | Nuages de mots |
| `attachmentsAsImage: true` | Liste et fiches (vignette) |
| Concept `image` | Diaporama |
| `isRest: true` (dataset éditable) | Formulaire de saisie, Contributions collaboratives |
| Présence de `count` | Liste et fiches, Tableau synthétique |

---

## 8. Conseils et pièges à éviter

- **Toujours définir `datasets[0]`** : sans dataset racine, l'app affiche « Veuillez choisir une source de données pour le filtre commun ».
- **Cohérence des filtres** : les `filters[]` se basent sur le dataset racine. Si une visu utilise un dataset externe, ses filtres propres ne s'appliquent pas au dashboard global — le préciser à l'utilisateur.
- **`source: 'root'` vs `'external'`** : par défaut `'root'` pour `tablePreview` et `application`. Mettre `'external'` quand la visu doit afficher un dataset **non filtré** (par exemple un référentiel).
- **Distinction embed dataset vs application (transmission des filtres)** : les `filters[]` du dashboard s'appliquent différemment selon le type d'élément — voir § 2.3.1. Pour un élément `application`, les filtres dynamiques ne sont PAS injectés dans l'URL (l'app ne connaît pas le dataset racine) ; ils sont poussés via le state-change adapter d-frame. Si l'application doit recevoir les filtres, vérifier qu'elle déclare `df:filter-concepts: true` (et un `df:sync-state: true`) dans sa metadata. Sans cela, les filtres du dashboard n'atteindront pas l'application.
- **`valueMandatory` + `mandatoryFilters`** : indispensable pour les visus qui n'ont aucun sens sans un filtre actif (ex. : carte centrée sur un territoire, fiche d'un item). Sans cela, la viz affiche un état vide.
- **`height` négatif** des rows : à privilégier pour les visus à hauteur variable (tableaux, cartes). À fixer en px seulement pour les graphes en hauteur définie.
- **`width: 3`** : à réserver aux visus qui doivent dominer (carte plein écran, timeline large). Combiné à `width: 1` sur la même row, cela donne un layout 1/3 + 2/3.
- **Trop de sections** : au-delà de 6 sections, préférer `flow` ou regrouper en sous-thèmes.
- **Réutiliser un dashboard existant** : au lieu de réassembler, embarquer un dashboard complet via l'application « Dashboards » (`type: 'application'`, `application` pointant vers un sous-dashboard).
- **Concepts** : privilégier les datasets avec champs ayant un `concept` (schema.org, INSEE, etc.) pour activer le filtrage inter-applications.
- **Disponibilité effective d'une viz** : ce catalogue est une **référence**. L'agent doit idéalement vérifier que la base-application correspondante est bien installée sur le portail (via le MCP ou en demandant confirmation à l'utilisateur) avant de figer son `id` et son `href` dans la config. À défaut, l'utilisateur final verra un message d'erreur au rendu.
- **Évolution des versions** : les URL `/apps/<nom>/<version>/` changent à chaque release. L'agent doit soit récupérer la dernière version via MCP, soit proposer la version listée ici comme point de départ.
