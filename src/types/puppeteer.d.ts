declare module 'puppeteer' {
  interface Browser {
    newPage(): Promise<Page>
    close(): Promise<void>
  }
  interface Page {
    goto(url: string, options?: Record<string, unknown>): Promise<void>
    setContent(html: string, options?: Record<string, unknown>): Promise<void>
    pdf(options?: Record<string, unknown>): Promise<Buffer>
    screenshot(options?: Record<string, unknown>): Promise<Buffer>
    close(): Promise<void>
  }
  interface LaunchOptions {
    headless?: boolean | 'new'
    args?: string[]
  }
  export function launch(options?: LaunchOptions): Promise<Browser>
}
