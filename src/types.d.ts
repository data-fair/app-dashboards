import type { Application } from '@data-fair/lib-common-types/application/index.js'
import type { DashboardConfig } from '@/config'

declare global {
  interface Window {
    APPLICATION: Application & {
      href: string
      exposedUrl: string
      apiUrl: string
      wsUrl: string
      configuration: DashboardConfig
      baseApp: { id: string; url: string; meta: Record<string, unknown> }
    }
    iFrameResizer: {
      heightCalculationMethod: string
    }
    /** Options lues par le shim v-iframe-compat injecté par DataFair (df:sync-state). */
    vIframeOptions?: { reactiveParams: unknown }
    /** Fonction injectée par le service de capture DataFair. */
    triggerCapture?: (animationSupported?: boolean) => void
  }
}

export {}
