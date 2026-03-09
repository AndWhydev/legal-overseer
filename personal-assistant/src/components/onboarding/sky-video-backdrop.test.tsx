import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { SkyVideoBackdrop } from './sky-video-backdrop'

describe('SkyVideoBackdrop', () => {
  it('renders the poster fallback and atmospheric layers on the server', () => {
    const html = renderToStaticMarkup(<SkyVideoBackdrop />)

    expect(html).toContain('onboarding-sky-poster.jpg')
    expect(html).toContain('bg-[#c8e4ff]')
  })
})
