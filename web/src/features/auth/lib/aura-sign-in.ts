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
import type { CustomOAuthProviderInfo, SystemStatus } from '../types'

/** Slug of the custom OAuth provider that is promoted to the primary sign-in button. */
export const PRIMARY_OAUTH_SLUG = 'aura'

export function findPrimaryOAuthProvider(
  status: SystemStatus | null
): CustomOAuthProviderInfo | undefined {
  return status?.custom_oauth_providers?.find(
    (provider) => provider.slug === PRIMARY_OAUTH_SLUG
  )
}

/**
 * Whether the sign-in page should advertise the sign-up link. Display only:
 * the server rejects password registration independently of this flag.
 */
export function isSignUpLinkVisible(status: SystemStatus | null): boolean {
  if (status?.self_use_mode_enabled) return false
  const registerEnabled =
    status?.register_enabled ?? status?.data?.register_enabled
  const passwordRegisterEnabled =
    status?.password_register_enabled ?? status?.data?.password_register_enabled
  return registerEnabled !== false && passwordRegisterEnabled !== false
}
