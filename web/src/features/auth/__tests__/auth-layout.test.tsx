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
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AuthLayout } from '../auth-layout'

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: 'Test',
    logo: '/logo.png',
    loading: false,
  }),
}))

describe('AuthLayout', () => {
  it('keeps a visible link to the original project on the sign-in surface', async () => {
    const root = createRootRoute()
    const route = createRoute({
      getParentRoute: () => root,
      path: '/',
      component: () => (
        <AuthLayout>
          <p>content</p>
        </AuthLayout>
      ),
    })
    const router = createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)

    const link = await screen.findByRole('link', { name: 'New API' })
    expect(link).toBeVisible()
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/QuantumNous/new-api'
    )
  })

  it('shows the NOTICE attribution sentence verbatim on the sign-in surface', async () => {
    const root = createRootRoute()
    const route = createRoute({
      getParentRoute: () => root,
      path: '/',
      component: () => (
        <AuthLayout>
          <p>content</p>
        </AuthLayout>
      ),
    })
    const router = createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)

    expect(
      await screen.findByText(
        'Frontend design and development by New API contributors.'
      )
    ).toBeVisible()
  })
})
