import { test, expect } from '@playwright/test'
import {
  tableDFrameSrc,
  formDFrameSrc,
  applicationDFrameSrc,
  applicationUrl,
  descriptionUrl,
  sourcesUrl,
  captureUrl,
  embedCode
} from '@/utils/element-url'
import type { TablePreviewElement, FormElement, ApplicationElement } from '@/config'

const tableEl = (overrides: Partial<TablePreviewElement> = {}): TablePreviewElement => ({ type: 'tablePreview', ...overrides })
const formEl = (overrides: Record<string, unknown> = {}): FormElement => ({ type: 'form', ...overrides }) as FormElement
const appEl = (overrides: Partial<ApplicationElement> = {}): ApplicationElement => ({
  type: 'application',
  application: {
    id: 'sankey',
    title: 'Sankey',
    href: 'https://demo.datafair.fr/data-fair/app/sankey',
    baseApp: { meta: { 'df:capture-width': 1200, 'df:capture-height': 800 } }
  },
  ...overrides
})

test.describe('tableDFrameSrc', () => {
  test('produit une URL minimale sur le dataset racine', () => {
    expect(tableDFrameSrc(tableEl(), 'ds1', null, null, undefined, undefined, undefined, '')).toBe(
      '/data-fair/embed/dataset/ds1/table?d-frame=true&interaction=true'
    )
  })

  test('dé-préfixe les filtres dataset-scopés, garde les clés concept et finalizedAt', () => {
    const filters = {
      keys: ['int'],
      _d_ds1_int_in: '1,2',
      _d_ds1_cat_in: 'a',
      _c_date_match: '2020',
      finalizedAt: '2020-01-01',
      nullValue: null
    }
    const src = tableDFrameSrc(tableEl(), 'ds1', null, filters, undefined, undefined, undefined, '')
    expect(src).toContain('int_in=1%2C2')
    expect(src).toContain('cat_in=a')
    expect(src).toContain('_c_date_match=2020')
    expect(src).toContain('finalizedAt=2020-01-01')
    expect(src).not.toContain('_d_ds1_int_in=')
    expect(src).not.toContain('keys=')
    expect(src).not.toContain('nullValue=')
  })

  test('strippe le préfixe de colonne (compare-view) ; les clés d\'un autre préfixe passent telles quelles', () => {
    const filters = { keys: [], c_d_ds1_int_in: '1', _d_ds1_int_in: '2' }
    const src = tableDFrameSrc(tableEl(), 'ds1', null, filters, undefined, undefined, undefined, 'c')
    expect(src).toContain('int_in=1')
    expect(src).not.toContain('c_d_ds1_int_in')
    // Comportement actuel : seul le scope exact `<prefix>_d_<id>_` est strippé,
    // une clé sans ce préfixe est forwardée inchangée.
    expect(src).toContain('_d_ds1_int_in=2')
  })

  test('préfixe le dataset id avec l\'accessKey', () => {
    const src = tableDFrameSrc(tableEl(), 'ds1', 'abc', null, undefined, undefined, undefined, '')
    expect(src).toMatch(/^\/data-fair\/embed\/dataset\/abc%3Ads1\/table\?/)
  })

  test('ignore les filtres quand ignoreFilters est activé', () => {
    const filters = { keys: [], _d_ds1_int_in: '1' }
    const src = tableDFrameSrc(tableEl({ ignoreFilters: true }), 'ds1', null, filters, undefined, undefined, undefined, '')
    expect(src).toBe('/data-fair/embed/dataset/ds1/table?d-frame=true&interaction=true')
  })

  test('transmet primary/secondary, display et cols', () => {
    const src = tableDFrameSrc(
      tableEl({ display: 'table-dense', fields: ['a', 'b'] }),
      'ds1', null, null, 'x', 'y', undefined, ''
    )
    expect(src).toContain('primary=x')
    expect(src).toContain('secondary=y')
    expect(src).toContain('display=table-dense')
    expect(src).toContain('cols=a%2Cb')
  })

  test('désactive les interactions si noInteractions', () => {
    const src = tableDFrameSrc(tableEl({ noInteractions: true }), 'ds1', null, null, undefined, undefined, undefined, '')
    expect(src).toContain('interaction=false')
  })

  // Comportement actuel documenté : pour la vue table, `interaction` est
  // systématiquement écrasé par `String(!noInteractions)` APRÈS le traitement
  // de `print` → le mode print n'a pas d'effet sur l'interaction d'une table.
  test('print ne change pas interaction pour la vue table (écrasé par noInteractions)', () => {
    const src = tableDFrameSrc(tableEl(), 'ds1', null, null, undefined, undefined, 'true', '')
    expect(src).toContain('interaction=true')
  })
})

test.describe('formDFrameSrc', () => {
  test('produit une URL sur le dataset de l\'élément', () => {
    const src = formDFrameSrc(formEl({ dataset: { id: 'form-ds', title: 'Form' } }), null, null, undefined, undefined, undefined, '')
    expect(src).toMatch(/^\/data-fair\/embed\/dataset\/form-ds\/form\?d-frame=true$/)
  })

  test('renvoie undefined pour un élément sans dataset (état invalide)', () => {
    expect(formDFrameSrc(formEl(), null, null, undefined, undefined, undefined, '')).toBeUndefined()
  })

  test('dé-préfixe les filtres et préfixe avec l\'accessKey', () => {
    const filters = { keys: [], '_d_form-ds_int_in': '7' }
    const src = formDFrameSrc(formEl({ dataset: { id: 'form-ds', title: 'Form' } }), 'k1', filters, undefined, undefined, undefined, '')
    expect(src).toMatch(/^\/data-fair\/embed\/dataset\/k1%3Aform-ds\/form\?/)
    expect(src).toContain('int_in=7')
    expect(src).not.toContain('_d_form-ds_int_in')
  })

  test('print désactive l\'interaction', () => {
    const src = formDFrameSrc(formEl({ dataset: { id: 'form-ds', title: 'Form' } }), null, null, undefined, undefined, 'true', '')
    expect(src).toContain('interaction=false')
  })
})

test.describe('applicationDFrameSrc', () => {
  test('renvoie undefined pour un élément sans application (état invalide)', () => {
    expect(applicationDFrameSrc(appEl({ application: undefined as any }), null, null, undefined, undefined, undefined)).toBeUndefined()
  })

  test('renvoie undefined pour une application sans id (état invalide)', () => {
    expect(applicationDFrameSrc(appEl({ application: { ...appEl().application!, id: '' } }), null, null, undefined, undefined, undefined)).toBeUndefined()
  })

  test('produit une URL minimale sur l\'application', () => {
    expect(applicationDFrameSrc(appEl(), null, null, undefined, undefined, undefined)).toBe(
      '/data-fair/app/sankey?d-frame=true'
    )
  })

  test('préfixe avec l\'accessKey', () => {
    const src = applicationDFrameSrc(appEl(), 'KEY', null, undefined, undefined, undefined)
    expect(src).toMatch(/^\/data-fair\/app\/KEY%3Asankey\?/)
  })

  test('conserve tous les filtres dataset-scopés et concept sans stripping', () => {
    const filters = {
      keys: ['int'],
      _d_ds1_int_in: '1',
      _d_ds1_cat_in: 'a',
      _c_date_match: '2020',
      finalizedAt: '2020-01-01'
    }
    const src = applicationDFrameSrc(appEl(), null, filters, undefined, undefined, undefined)
    expect(src).toContain('_d_ds1_int_in=1')
    expect(src).toContain('_d_ds1_cat_in=a')
    expect(src).toContain('_c_date_match=2020')
    expect(src).toContain('finalizedAt=2020-01-01')
    expect(src).not.toContain('keys=')
  })

  test('ignore les filtres quand ignoreFilters est activé', () => {
    const src = applicationDFrameSrc(appEl({ ignoreFilters: true }), null, { keys: [], _d_ds1_int_in: '1' }, undefined, undefined, undefined)
    expect(src).toBe('/data-fair/app/sankey?d-frame=true')
  })

  test('transmet primary/secondary et print désactive l\'interaction', () => {
    const src = applicationDFrameSrc(appEl(), null, null, 'p', 's', 'true')
    expect(src).toContain('primary=p')
    expect(src).toContain('secondary=s')
    expect(src).toContain('interaction=false')
  })
})

test.describe('applicationUrl / descriptionUrl / sourcesUrl', () => {
  const app = { href: 'https://host1/data-fair/app/real-app' }

  test('renvoie undefined pour un élément non-application', () => {
    expect(applicationUrl(tableEl(), app)).toBeUndefined()
    expect(descriptionUrl(tableEl(), app)).toBeUndefined()
    expect(sourcesUrl(tableEl(), app, true)).toBeUndefined()
  })

  test('reconstruit l\'URL de l\'application sur l\'hôte de l\'app courante', () => {
    expect(applicationUrl(appEl(), app)).toBe('https://host1/data-fair/app/sankey')
    expect(applicationUrl(appEl({ application: { ...appEl().application!, href: 'https://other/data-fair/app/v2' } }), app)).toBe('https://host1/data-fair/app/v2')
  })

  test('renvoie undefined sans href d\'application', () => {
    expect(applicationUrl({ ...appEl(), application: undefined as any }, app)).toBeUndefined()
  })

  test('préfère apiUrl (contexte config) pour reconstruire l\'URL API', () => {
    // En mode config, window.APPLICATION.href est l'URL de l'UI (ex. /config)
    // sans segment /data-fair/ : seule apiUrl permet de rebaser l'app cible.
    const appWithApi = { href: 'https://host1/config', apiUrl: 'https://host1/data-fair/api/v1' }
    expect(applicationUrl(appEl(), appWithApi)).toBe('https://host1/data-fair/api/v1/applications/sankey')
    expect(applicationUrl(appEl({ application: { ...appEl().application!, href: 'https://other/data-fair/app/v2' } }), appWithApi)).toBe('https://host1/data-fair/api/v1/applications/sankey')
  })

  test('repli sur href quand apiUrl est absent', () => {
    expect(applicationUrl(appEl(), { href: 'https://host1/data-fair/app/real-app' })).toBe('https://host1/data-fair/app/sankey')
  })

  test('descriptionUrl renvoie l\'URL sauf si description est none', () => {
    expect(descriptionUrl(appEl({ description: 'left' }), app)).toBe('https://host1/data-fair/app/sankey')
    expect(descriptionUrl(appEl({ description: 'none' }), app)).toBeUndefined()
  })

  test('sourcesUrl ajoute /configuration si showSources', () => {
    expect(sourcesUrl(appEl(), app, true)).toBe('https://host1/data-fair/app/sankey/configuration')
    expect(sourcesUrl(appEl(), app, false)).toBeUndefined()
    // showSources actif mais URL d'application indisponible → undefined
    expect(sourcesUrl({ ...appEl(), application: undefined as any }, app, true)).toBeUndefined()
  })

  test('sourcesUrl utilise apiUrl quand elle est disponible', () => {
    const appWithApi = { href: 'https://host1/config', apiUrl: 'https://host1/data-fair/api/v1' }
    expect(sourcesUrl(appEl(), appWithApi, true)).toBe('https://host1/data-fair/api/v1/applications/sankey/configuration')
  })
})

test.describe('captureUrl', () => {
  test('renvoie undefined hors élément application sans href', () => {
    expect(captureUrl(tableEl(), null)).toBeUndefined()
    expect(captureUrl({ ...appEl(), application: undefined as any }, null)).toBeUndefined()
  })

  test('build l\'URL de capture avec les metas df:capture et les filtres préfixés app_', () => {
    const filters = { keys: ['int'], _d_ds1_int_in: '1', _c_date_match: '2020' }
    const url = captureUrl(appEl(), filters)!
    expect(url.startsWith('https://demo.datafair.fr/data-fair/app/sankey/capture?')).toBe(true)
    expect(url).toContain('app_embed=true')
    expect(url).toContain('width=1200')
    expect(url).toContain('height=800')
    expect(url).toContain('app__d_ds1_int_in=1')
    expect(url).toContain('app__c_date_match=2020')
    expect(url).not.toContain('app_keys')
  })

  test('omet width/height sans metas df:capture', () => {
    const el = appEl({ application: { ...appEl().application!, baseApp: { meta: {} } } })
    const url = captureUrl(el, null)!
    expect(url).toContain('app_embed=true')
    expect(url).not.toContain('width=')
    expect(url).not.toContain('height=')
  })

  test('tolère un baseApp sans meta', () => {
    const el = appEl({ application: { ...appEl().application!, baseApp: { meta: undefined as any } } })
    const url = captureUrl(el, null)!
    expect(url).toContain('app_embed=true')
  })
})

test.describe('embedCode', () => {
  test('renvoie undefined hors élément application sans id', () => {
    expect(embedCode(tableEl(), 'https://host/app', null)).toBeUndefined()
    expect(embedCode({ ...appEl(), application: { ...appEl().application!, id: '' } }, 'https://host/app', null)).toBeUndefined()
  })

  test('build l\'iframe embed sur l\'hôte exposé', () => {
    expect(embedCode(appEl(), 'https://host/data-fair/app/abc', null)).toBe(
      '<iframe src="https://host/data-fair/app/sankey?embed=true" width="100%" height="500px" style="background-color: transparent; border: none;"></iframe>'
    )
  })

  test('préfixe l\'accessKey dans le src', () => {
    const code = embedCode(appEl(), 'https://host/data-fair/app/abc', 'KEY')!
    expect(code).toContain('https://host/data-fair/app/KEY%3Asankey?embed=true')
  })
})
