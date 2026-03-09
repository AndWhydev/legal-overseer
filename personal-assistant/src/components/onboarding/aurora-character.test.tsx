import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { AuroraCharacter } from './aurora-character'

describe('AuroraCharacter', () => {
  it('renders the animated BitBit mascot with an accessible label', () => {
    const html = renderToStaticMarkup(<AuroraCharacter interactive={false} />)

    expect(html).toContain('aria-label="Animated BitBit mascot"')
    expect(html).toContain('data-testid="aurora-character"')
  })
})
