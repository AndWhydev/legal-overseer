import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  OnboardingStageProgress,
  canBacktrackToStage,
  getStageSequence,
} from './stage-progress'

describe('stage progress helpers', () => {
  it('builds the right stage sequence when workspace is part of onboarding', () => {
    expect(getStageSequence(true)).toEqual(['workspace', 'connections', 'sync', 'value'])
    expect(getStageSequence(false)).toEqual(['connections', 'sync', 'value'])
  })

  it('only allows backtracking to editable earlier stages', () => {
    expect(canBacktrackToStage('value', 'connections', true)).toBe(true)
    expect(canBacktrackToStage('connections', 'workspace', true)).toBe(true)
    expect(canBacktrackToStage('value', 'sync', true)).toBe(false)
    expect(canBacktrackToStage('connections', 'value', true)).toBe(false)
  })
})

describe('OnboardingStageProgress', () => {
  it('renders the current position and labels', () => {
    const html = renderToStaticMarkup(
      <OnboardingStageProgress currentStage="connections" showWorkspaceStep={true} />,
    )

    expect(html).toContain('2 / 4')
    expect(html).toContain('Workspace')
    expect(html).toContain('Connections')
    expect(html).toContain('Sync')
    expect(html).toContain('Ready')
  })
})
