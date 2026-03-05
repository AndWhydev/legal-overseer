import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { test as setup, expect } from '@playwright/test'
import { AUTH_SKIP_REASON, ensureAuthenticated } from './helpers'

const authStatePath = path.join(process.cwd(), 'test-results', '.auth', 'user.json')

setup('bootstrap authenticated browser state', async ({ page }) => {
  await mkdir(path.dirname(authStatePath), { recursive: true })

  const authenticated = await ensureAuthenticated(page, '/dashboard')
  expect(authenticated, AUTH_SKIP_REASON).toBeTruthy()

  await page.context().storageState({ path: authStatePath })
})
