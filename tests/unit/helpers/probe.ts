// Probe component: mounts a composable inside a real Vue app so that inject()
// (useConfig, useUiNotif) and lifecycle-bound effects work as in production.
import { createApp, defineComponent, h, type App } from 'vue'

const mounted: App[] = []

export function probe<T> (composable: () => T, install?: (app: App) => void): T {
  let captured: T | undefined
  const app = createApp(defineComponent({
    setup () {
      captured = composable()
      return () => h('div')
    }
  }))
  install?.(app)
  app.mount(document.createElement('div'))
  mounted.push(app)
  return captured as T
}

/** Unmount every probe so its watchers stop reacting to shared singletons. */
export function unmountProbes (): void {
  for (const app of mounted.splice(0)) app.unmount()
}
