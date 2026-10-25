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
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { useOAuthLogin } from '../hooks/use-oauth-login'
import type { CustomOAuthProviderInfo, SystemStatus } from '../types'

type PrimaryOAuthButtonProps = {
  provider: CustomOAuthProviderInfo
  status: SystemStatus | null
  disabled?: boolean
  redirectTo?: string
}

/** Presentation wrapper: login itself is the shared custom OAuth handler. */
export function PrimaryOAuthButton(props: PrimaryOAuthButtonProps) {
  const { t } = useTranslation()
  const oauth = useOAuthLogin(props.status, props.redirectTo)

  return (
    <Button
      type='button'
      disabled={props.disabled || oauth.isLoading}
      onClick={() => oauth.handleCustomOAuthLogin(props.provider)}
      className='h-11 w-full justify-center gap-2 rounded-lg'
    >
      {oauth.isLoading && <Loader2 className='animate-spin' />}
      {t('Sign in with {{name}}', { name: props.provider.name })}
    </Button>
  )
}
