import type { Application } from '@data-fair/lib-common-types/application/index.js'
import type { FullSiteInfo } from '@data-fair/lib-vue/session.js'
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
    /** Set by _public.js, read by the session instead of the deprecated fetch. */
    __PUBLIC_SITE_INFO?: FullSiteInfo
    iFrameResizer: {
      heightCalculationMethod: string
    }
    /** Options read by the v-iframe-compat shim injected by DataFair (df:sync-state). */
    vIframeOptions?: { reactiveParams: unknown }
    /** Function injected by the DataFair capture service. */
    triggerCapture?: (animationSupported?: boolean) => void
  }
}

export {}
