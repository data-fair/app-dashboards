import type { Application } from '@data-fair/lib-common-types/application/index.js'

declare global {
  interface Window {
    APPLICATION: Application & {
      href: string
      exposedUrl: string
      apiUrl: string
      wsUrl: string
      configuration: any
      baseApp: { id: string; url: string; meta: Record<string, unknown> }
    }
    iFrameResizer: {
      heightCalculationMethod: string
    }
  }
}

export {}
