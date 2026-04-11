import { describe, it, expect } from 'vitest'
import { selectModel } from '../model-router'
import * as modelRouter from '../model-router'

/**
 * Engine stream sanitization & model-router refactoring tests.
 *
 * Verifies:
 * - model-router.ts no longer exports getModel/getAllModels/routeToModel (AC-4)
 * - selectModel returns { purpose } instead of { tier } (AC-4)
 */

describe('model-router refactoring (AC-4)', () => {
  it('getModel should no longer be exported', () => {
    expect((modelRouter as Record<string, unknown>).getModel).toBeUndefined()
  })

  it('getAllModels should no longer be exported', () => {
    expect((modelRouter as Record<string, unknown>).getAllModels).toBeUndefined()
  })

  it('routeToModel should no longer be exported', () => {
    expect((modelRouter as Record<string, unknown>).routeToModel).toBeUndefined()
  })

  it('selectModel should return purpose instead of tier', () => {
    const result = selectModel('Hello world')

    expect(result).toHaveProperty('purpose')
    expect(result).not.toHaveProperty('tier')
    expect(result).toHaveProperty('model')
    expect(result).toHaveProperty('reasoning')
  })
})
