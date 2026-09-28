// Minimal replacements for vitest's vi.fn / vi.stubGlobal.

export type Recorder<A extends unknown[] = any[], R = unknown> = ((...args: A) => R) & { calls: A[] }

/** A function that records its call arguments in `.calls` and delegates to `impl`. */
export function fn<A extends unknown[] = any[], R = undefined> (impl?: (...args: A) => R): Recorder<A, R> {
  const calls: A[] = []
  const f = ((...args: A) => {
    calls.push(args)
    return impl?.(...args) as R
  }) as Recorder<A, R>
  f.calls = calls
  return f
}

const stubbed: Array<[string, PropertyDescriptor | undefined]> = []

/** Replace a global (e.g. `window`) until `unstubAllGlobals()`. */
export function stubGlobal (key: string, value: unknown): void {
  stubbed.push([key, Object.getOwnPropertyDescriptor(globalThis, key)])
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
}

export function unstubAllGlobals (): void {
  for (const [key, descriptor] of stubbed.reverse()) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete (globalThis as Record<string, unknown>)[key]
  }
  stubbed.length = 0
}

/** Let pending promises (stubbed fetch responses, ofetch parsing) settle. */
export const settle = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))
