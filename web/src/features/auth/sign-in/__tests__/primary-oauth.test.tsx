/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SystemStatus } from '../../types'
import { UserAuthForm } from '../components/user-auth-form'

const mocks = vi.hoisted(() => ({
  status: null as SystemStatus | null,
  logout: vi.fn(),
  createOAuthFlow: vi.fn(),
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: mocks.status, loading: false, error: null }),
}))

vi.mock('@/features/auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/auth/api')>()),
  logout: mocks.logout,
  createOAuthFlow: mocks.createOAuthFlow,
}))

const auraProvider = {
  id: 7,
  name: '灵环',
  slug: 'aura',
  icon: '',
  client_id: 'aura-client',
  authorization_endpoint: 'https://idp.example/authorize',
  scopes: 'openid profile',
}

async function renderForm(status: SystemStatus) {
  mocks.status = status
  const root = createRootRoute()
  const route = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <UserAuthForm redirectTo='/keys' />,
  })
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('button', { name: /Sign in with|^Sign in$/ })
}

describe('primary OAuth sign-in', () => {
  const open = vi.fn()

  beforeEach(() => {
    mocks.logout.mockResolvedValue({ success: true })
    mocks.createOAuthFlow.mockResolvedValue('state-123')
    vi.stubGlobal('open', open)
    window.open = open
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    window.sessionStorage.clear()
  })

  it('shows the aura provider as the main button and keeps the password form collapsed', async () => {
    await renderForm({
      custom_oauth_providers: [auraProvider],
      password_login_enabled: true,
    } as SystemStatus)

    expect(
      screen.getByRole('button', { name: 'Sign in with 灵环' })
    ).toBeVisible()
    const toggle = screen.getByRole('button', {
      name: 'Administrator password sign-in',
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Continue with 灵环' })
    ).not.toBeInTheDocument()
  })

  it('reveals the existing password form when the toggle is used', async () => {
    const user = userEvent.setup()
    await renderForm({
      custom_oauth_providers: [auraProvider],
      password_login_enabled: true,
    } as SystemStatus)

    const toggle = screen.getByRole('button', {
      name: 'Administrator password sign-in',
    })
    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Username or Email')).toBeVisible()
    expect(screen.getByLabelText('Password')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  it('does not offer a password toggle when password login is disabled', async () => {
    await renderForm({
      custom_oauth_providers: [auraProvider],
      password_login_enabled: false,
    } as SystemStatus)

    expect(
      screen.queryByRole('button', { name: 'Administrator password sign-in' })
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })

  it('starts the same OAuth flow as the generic provider button', async () => {
    const user = userEvent.setup()
    await renderForm({
      custom_oauth_providers: [auraProvider],
    } as SystemStatus)

    await user.click(screen.getByRole('button', { name: 'Sign in with 灵环' }))

    await waitFor(() => expect(open).toHaveBeenCalledTimes(1))
    expect(mocks.logout).toHaveBeenCalledTimes(1)
    expect(mocks.createOAuthFlow).toHaveBeenCalledWith('aura', 'login')
    const [url, target] = open.mock.calls[0] as [string, string]
    const authorize = new URL(url)
    expect(target).toBe('_self')
    expect(`${authorize.origin}${authorize.pathname}`).toBe(
      'https://idp.example/authorize'
    )
    expect(Object.fromEntries(authorize.searchParams)).toEqual({
      client_id: 'aura-client',
      redirect_uri: `${window.location.origin}/oauth/aura`,
      response_type: 'code',
      state: 'state-123',
      scope: 'openid profile',
    })
    expect(
      window.sessionStorage.getItem('oauth_login_redirect:state-123')
    ).toBe('/keys')
  })

  it('does not start the flow when the previous session cannot be cleared', async () => {
    mocks.logout.mockResolvedValue({ success: false, message: 'denied' })
    const user = userEvent.setup()
    await renderForm({
      custom_oauth_providers: [auraProvider],
    } as SystemStatus)

    await user.click(screen.getByRole('button', { name: 'Sign in with 灵环' }))

    await waitFor(() => expect(mocks.logout).toHaveBeenCalled())
    expect(mocks.createOAuthFlow).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  it('keeps the upstream layout when no aura provider exists', async () => {
    await renderForm({
      custom_oauth_providers: [
        { ...auraProvider, slug: 'other', name: 'Other' },
      ],
      password_login_enabled: true,
    } as SystemStatus)

    expect(screen.getByLabelText('Password')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Continue with Other' })
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Administrator password sign-in' })
    ).not.toBeInTheDocument()
  })
})
