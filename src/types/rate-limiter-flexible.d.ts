declare module 'rate-limiter-flexible' {
  interface RateLimiterRes {
    msBeforeNext: number
    remainingPoints: number
    consumedPoints: number
    isFirstInDuration: boolean
  }

  interface RateLimiterOpts {
    points: number
    duration: number
    blockDuration?: number
    keyPrefix?: string
  }

  export class RateLimiterMemory {
    constructor(opts: RateLimiterOpts)
    consume(key: string, pointsToConsume?: number): Promise<RateLimiterRes>
    get(key: string): Promise<RateLimiterRes | null>
    delete(key: string): Promise<boolean>
  }
}
