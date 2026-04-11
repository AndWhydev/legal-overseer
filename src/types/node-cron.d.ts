declare module 'node-cron' {
  interface ScheduledTask {
    start(): void
    stop(): void
    destroy(): void
  }
  interface ScheduleOptions {
    scheduled?: boolean
    timezone?: string
  }
  export function schedule(expression: string, func: () => void, options?: ScheduleOptions): ScheduledTask
  export function validate(expression: string): boolean
}
