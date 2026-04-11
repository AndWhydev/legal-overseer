declare module 'better-sqlite3' {
  interface RunResult {
    changes: number
    lastInsertRowid: number | bigint
  }

  interface Statement {
    run(...params: unknown[]): RunResult
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
    iterate(...params: unknown[]): IterableIterator<unknown>
  }

  interface Database {
    prepare(sql: string): Statement
    exec(sql: string): this
    close(): void
    pragma(pragma: string, options?: Record<string, unknown>): unknown
    transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T
  }

  // Support both direct import and Database.Database usage
  namespace Database {
    interface Database {
      prepare(sql: string): Statement
      exec(sql: string): this
      close(): void
      pragma(pragma: string, options?: Record<string, unknown>): unknown
      transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T
    }
  }

  interface DatabaseConstructor {
    new (filename: string, options?: Record<string, unknown>): Database
    (filename: string, options?: Record<string, unknown>): Database
  }

  const Database: DatabaseConstructor
  export default Database
  export type { Database, Statement, RunResult }
}
