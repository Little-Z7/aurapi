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
import { describe, expect, it } from 'vitest'

import type { CustomOAuthProviderInfo, SystemStatus } from '../../types'
import { findPrimaryOAuthProvider, isSignUpLinkVisible } from '../aura-sign-in'

function provider(slug: string): CustomOAuthProviderInfo {
  return {
    id: 1,
    name: slug,
    slug,
    icon: '',
    client_id: 'client',
    authorization_endpoint: 'https://idp.example/authorize',
    scopes: '',
  }
}

describe('findPrimaryOAuthProvider', () => {
  it('returns the provider whose slug is aura', () => {
    const status = {
      custom_oauth_providers: [provider('other'), provider('aura')],
    } as SystemStatus

    expect(findPrimaryOAuthProvider(status)?.slug).toBe('aura')
  })

  it('returns undefined when no aura provider is configured', () => {
    expect(findPrimaryOAuthProvider(null)).toBeUndefined()
    expect(findPrimaryOAuthProvider({} as SystemStatus)).toBeUndefined()
    expect(
      findPrimaryOAuthProvider({
        custom_oauth_providers: [provider('other')],
      } as SystemStatus)
    ).toBeUndefined()
  })
})

describe('isSignUpLinkVisible', () => {
  it('shows the link while registration flags are unset (upstream default)', () => {
    expect(isSignUpLinkVisible(null)).toBe(true)
    expect(isSignUpLinkVisible({} as SystemStatus)).toBe(true)
  })

  it('hides the link when password registration is off even if registration is on', () => {
    expect(
      isSignUpLinkVisible({
        register_enabled: true,
        password_register_enabled: false,
      } as SystemStatus)
    ).toBe(false)
  })

  it('hides the link when registration is off or self-use mode is on', () => {
    expect(
      isSignUpLinkVisible({ register_enabled: false } as SystemStatus)
    ).toBe(false)
    expect(
      isSignUpLinkVisible({ self_use_mode_enabled: true } as SystemStatus)
    ).toBe(false)
  })

  it('reads the flags nested under data as well', () => {
    expect(
      isSignUpLinkVisible({
        data: { password_register_enabled: false },
      } as SystemStatus)
    ).toBe(false)
  })
})
