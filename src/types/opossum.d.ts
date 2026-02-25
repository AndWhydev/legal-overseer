declare module 'opossum' {
  interface CircuitBreakerOptions {
    timeout?: number
    errorThresholdPercentage?: number
    resetTimeout?: number
    volumeThreshold?: number
    rollingCountTimeout?: number
    rollingCountBuckets?: number
  }

  interface CircuitBreakerStatus {
    successes?: number
    failures?: number
    timeouts?: number
    rejects?: number
    latencyMean?: number
    stats?: {
      successes: number
      failures: number
      timeouts: number
      rejects: number
      latencyMean: number
      [key: string]: number
    }
    [key: string]: unknown
  }

  class CircuitBreaker<T extends (...args: any[]) => any = (...args: any[]) => any> {
    constructor(action: T, options?: CircuitBreakerOptions)
    fire(...args: Parameters<T>): Promise<ReturnType<T>>
    fallback(fn: (...args: Parameters<T>) => ReturnType<T>): this
    on(event: string, handler: (...args: any[]) => void): this
    opened: boolean
    closed: boolean
    halfOpen: boolean
    stats: CircuitBreakerStatus
    status: CircuitBreakerStatus
  }

  export = CircuitBreaker
}
