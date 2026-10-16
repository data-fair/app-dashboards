import { test, expect } from '@playwright/test'
import { parseSyncParams, getChildSrc, getParentUrl } from '@data-fair/frame/lib/utils/sync-params.js'

/**
 * Contrat du canal privé par élément (`sync-params="*:<scope>_"`), celui sur
 * lequel repose tout le relais des filtres émis par les visus embarqués.
 *
 * Ces assertions figent le comportement de `@data-fair/frame` : une montée de
 * version qui casserait l'injection, la purge ou l'anti-écho doit faire échouer
 * la suite. Les patterns partagés (`_c*`, `_d*`) sont volontairement exclus :
 * ils injectent les clés du parent dans l'enfant et suppriment de l'URL du
 * dashboard toute clé absente de l'enfant qui en émet (ils casseraient la
 * séparation des colonnes du mode comparaison).
 */
const scope = parseSyncParams('*:application-a_')
const src = 'http://host/data-fair/app/A?d-frame=true&finalizedAt=F'
const parentHref = [
  'http://host/app/dashboard',
  '?_d_ds1_dep_in=75',
  '&_c_codeCommune_in=86194',
  '&application-a__c_codeCommune_in=86194',
  '&application-b__c_q=b'
].join('')

const queryOf = (url: string | URL): Record<string, string> =>
  Object.fromEntries(new URL(url).searchParams.entries())

test.describe('canal privé du visu (sync-params *:<scope>_)', () => {
  test('descente : seules les clés de son propre scope reviennent dé-namespacées', () => {
    const query = queryOf(getChildSrc(src, parentHref, scope, null)!)
    // Son propre état lui est renvoyé, dé-namespacé.
    expect(query._c_codeCommune_in).toBe('86194')
    // Les clés du dashboard et des autres visus ne sont pas injectées : la src
    // calculée par le dashboard est la seule source des filtres.
    expect(query._d_ds1_dep_in).toBeUndefined()
    expect(query._c_q).toBeUndefined()
  })

  test('montée : ses clés sortent namespacées et celles du dashboard sont préservées', () => {
    const childHref = `${src}&_c_q=velo`
    const query = queryOf(getParentUrl(src, childHref, parentHref, scope, null)!)
    expect(query['application-a__c_q']).toBe('velo')
    // Aucune clé propre n'est écrite par l'enfant : la projection s'en charge.
    expect(query._c_q).toBeUndefined()
    // Les clés du dashboard ne sont pas supprimées par cette montée.
    expect(query._d_ds1_dep_in).toBe('75')
    expect(query._c_codeCommune_in).toBe('86194')
    expect(query['application-b__c_q']).toBe('b')
  })

  test('anti-écho : une clé identique à celle de la src n\'est pas ré-émise', () => {
    const query = queryOf(getParentUrl(
      'http://host/data-fair/app/A?d-frame=true&_c_codeCommune_in=86194',
      'http://host/data-fair/app/A?d-frame=true&_c_codeCommune_in=86194',
      parentHref,
      scope,
      null
    )!)
    expect(query['application-a__c_codeCommune_in']).toBe('86194')
  })

  test('purge bornée à son scope : une clé qu\'il supprime disparaît, pas celles du dashboard', () => {
    // L'enfant avait émis une clé puis l'a effacée : l'URL du dashboard la perd.
    const parentWithStale = `${parentHref}&application-a__c_q=velo`
    const childHref = 'http://host/data-fair/app/A?d-frame=true&_c_codeCommune_in=86194'
    const query = queryOf(getParentUrl(src, childHref, parentWithStale, scope, null)!)
    expect(query['application-a__c_q']).toBeUndefined()
    expect(query._d_ds1_dep_in).toBe('75')
    expect(query._c_codeCommune_in).toBe('86194')
  })

  // Deux éléments identiques dans deux lignes sont dédupliqués avec un `#n`
  // (utils/layout.ts) : le scope doit rester utilisable tel quel dans l'URL.
  test('un scope contenant # fonctionne (clé dédupliquée)', () => {
    const deduped = parseSyncParams('*:application-a#1_')
    const parent = 'http://host/app/dashboard?application-a%231__c_q=a'
    expect(queryOf(getChildSrc(src, parent, deduped, null)!)._c_q).toBe('a')
    expect(queryOf(getParentUrl(src, `${src}&_c_q=a`, parent, deduped, null)!))
      .toMatchObject({ 'application-a#1__c_q': 'a' })
  })
})
