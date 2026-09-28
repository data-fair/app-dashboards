// fetch stub for the unit tests, replacing the former `vi.mock('ofetch')`.
// ofetch delegates to globalThis.fetch, so this stub intercepts it for
// everyone (ofetch and lib-vue's useFetch included) and records every call for
// the assertions: unlike a module mock, the real ofetch serialization is tested.

export interface RecordedCall {
  url: string
  init?: RequestInit
  method: string
  /** Parsed JSON body (undefined when absent or not JSON). */
  json: () => unknown
}

export interface StubResponse {
  status?: number
  json?: unknown
  text?: string
}

/** A responder may throw to simulate a network error (fetch rejects). */
export type Responder = (url: string) => StubResponse

type Matcher = string | RegExp | ((url: string) => boolean)

export class FetchStub {
  calls: RecordedCall[] = []
  private responders: Array<{ match: Matcher, respond: Responder }> = []
  private originalFetch: typeof fetch | null = null

  install (): void {
    if (this.originalFetch) return
    this.originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL ? input.toString() : input.url
      this.calls.push({
        url,
        init,
        method: init?.method ?? (input instanceof Request ? input.method : 'GET'),
        json: () => {
          if (typeof init?.body !== 'string') return undefined
          try {
            return JSON.parse(init.body)
          } catch {
            return undefined
          }
        }
      })
      const responder = [...this.responders].reverse().find(r => this.matches(r.match, url))
      const res = responder ? responder.respond(url) : { status: 200, json: {} }
      const isJson = res.text === undefined
      return new Response(isJson ? JSON.stringify(res.json ?? {}) : res.text, {
        status: res.status ?? 200,
        // ofetch only parses the body when the content-type announces JSON
        headers: isJson ? { 'content-type': 'application/json' } : undefined
      })
    }) as typeof fetch
  }

  restore (): void {
    if (!this.originalFetch) return
    globalThis.fetch = this.originalFetch
    this.originalFetch = null
  }

  /** Reset calls and responders without uninstalling the stub. */
  reset (): void {
    this.calls = []
    this.responders = []
  }

  /** Register a response: the last rule matching the URL wins (LIFO). */
  on (match: Matcher, respond: StubResponse | Responder): void {
    this.responders.push({ match, respond: typeof respond === 'function' ? respond : () => respond })
  }

  private matches (match: Matcher, url: string): boolean {
    if (typeof match === 'string') return url.includes(match)
    if (match instanceof RegExp) return match.test(url)
    return match(url)
  }
}
