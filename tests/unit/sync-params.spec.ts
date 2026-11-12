import { test, expect } from '@playwright/test'
import { parseSyncParams, getChildSrc, getParentUrl } from '@data-fair/frame/lib/utils/sync-params.js'

/**
 * Contract of the private per-element channel (`sync-params="*:<scope>_"`), the one
 * the whole relay of the filters emitted by embedded visus relies on.
 *
 * These assertions pin the behavior of `@data-fair/frame`: a version upgrade
 * that would break the injection, the purge or the anti-echo must make the suite
 * fail (contract observed in 0.19: a value equal to the src one is removed
 * from the dashboard URL, see "anti-echo"). Shared patterns
 * (`_c*`, `_d*`) are deliberately excluded: they inject the parent's keys
 * into the child and remove from the dashboard URL every key missing from
 * the emitting child (they would break the column separation of the compare
 * view).
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

test.describe('private channel of the visu (sync-params *:<scope>_)', () => {
  test('down: only the keys of its own scope come back de-namespaced', () => {
    const query = queryOf(getChildSrc(src, parentHref, scope, null)!)
    // Its own state is sent back to it, de-namespaced.
    expect(query._c_codeCommune_in).toBe('86194')
    // The keys of the dashboard and of the other visus are not injected: the src
    // computed by the dashboard is the only source of the filters.
    expect(query._d_ds1_dep_in).toBeUndefined()
    expect(query._c_q).toBeUndefined()
  })

  test('up: its keys go out namespaced and the dashboard ones are preserved', () => {
    const childHref = `${src}&_c_q=velo`
    const query = queryOf(getParentUrl(src, childHref, parentHref, scope, null)!)
    expect(query['application-a__c_q']).toBe('velo')
    // No clean key is written by the child: the projection takes care of it.
    expect(query._c_q).toBeUndefined()
    // The dashboard keys are not removed by this upward sync.
    expect(query._d_ds1_dep_in).toBe('75')
    expect(query._c_codeCommune_in).toBe('86194')
    expect(query['application-b__c_q']).toBe('b')
  })

  test('anti-echo: a key identical to the src one is not kept by the dashboard', () => {
    // @data-fair/frame 0.19 contract: a value equal to the src one is
    // removed from the parent URL instead of being copied there. No loss for
    // the child: the value stays carried by the element's src.
    const query = queryOf(getParentUrl(
      'http://host/data-fair/app/A?d-frame=true&_c_codeCommune_in=86194',
      'http://host/data-fair/app/A?d-frame=true&_c_codeCommune_in=86194',
      parentHref,
      scope,
      null
    )!)
    expect(query['application-a__c_codeCommune_in']).toBeUndefined()
    expect(queryOf(getChildSrc(
      'http://host/data-fair/app/A?d-frame=true&_c_codeCommune_in=86194',
      'http://host/app/dashboard',
      scope,
      null
    )!)._c_codeCommune_in).toBe('86194')
  })

  test('purge bounded to its scope: a key it removes disappears, not the dashboard ones', () => {
    // The child had emitted a key then cleared it: the dashboard URL loses it.
    const parentWithStale = `${parentHref}&application-a__c_q=velo`
    const childHref = 'http://host/data-fair/app/A?d-frame=true&_c_codeCommune_in=86194'
    const query = queryOf(getParentUrl(src, childHref, parentWithStale, scope, null)!)
    expect(query['application-a__c_q']).toBeUndefined()
    expect(query._d_ds1_dep_in).toBe('75')
    expect(query._c_codeCommune_in).toBe('86194')
  })

  // Two identical elements in two rows are deduplicated with a `#n`
  // (utils/layout.ts): the scope must stay usable as-is in the URL.
  test('a scope containing # works (deduplicated key)', () => {
    const deduped = parseSyncParams('*:application-a#1_')
    const parent = 'http://host/app/dashboard?application-a%231__c_q=a'
    expect(queryOf(getChildSrc(src, parent, deduped, null)!)._c_q).toBe('a')
    expect(queryOf(getParentUrl(src, `${src}&_c_q=a`, parent, deduped, null)!))
      .toMatchObject({ 'application-a#1__c_q': 'a' })
  })
})
