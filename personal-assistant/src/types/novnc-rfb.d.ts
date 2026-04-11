declare module '@novnc/novnc/lib/rfb' {
  export interface RfbOptions {
    credentials?: {
      password?: string
    }
  }

  export default class RFB {
    constructor(target: Element, url: string, options?: RfbOptions)
    disconnect(): void
    scaleViewport: boolean
    resizeSession: boolean
  }
}
