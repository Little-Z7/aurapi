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
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import type { ParamTierPricing, ParamTierRow } from '../lib/param-tier-pricing'

type Translate = (key: string, options?: Record<string, unknown>) => string

const LABEL_PART_KEYS: Record<string, string> = {
  t2i: 'Text to image',
  i2i: 'Image to image',
}

const PARAM_KEYS: Record<string, string> = {
  quality: 'Quality',
  resolution: 'Resolution',
  size: 'Size',
  aspect_ratio: 'Aspect ratio',
  input_reference_count: 'Reference image count',
}

function paramTierRowLabel(row: ParamTierRow, t: Translate): string {
  const parts = row.labelParts.map((part) =>
    LABEL_PART_KEYS[part] ? t(LABEL_PART_KEYS[part]) : part
  )
  if (row.references !== undefined) {
    parts.push(t('{{count}} reference images', { count: row.references }))
  }
  return parts.join(' · ') || t('Default')
}

export function ParamTierTable(props: {
  pricing: ParamTierPricing
  formatPrice: (usd: number) => string
  matchedTierLabel?: string | null
  compact?: boolean
}) {
  const { t } = useTranslation()
  const hasReferences = props.pricing.rows.some(
    (row) => row.referenceStep !== undefined
  )
  return (
    <div className='min-w-0 space-y-2'>
      <p className='text-muted-foreground text-xs'>
        {t('Price depends on request parameters: {{params}}.', {
          params: props.pricing.params
            .map((param) => (PARAM_KEYS[param] ? t(PARAM_KEYS[param]) : param))
            .join(', '),
        })}
        {props.pricing.defaultLabel &&
          ` ${t('Requests without these parameters use the default tier.')}`}
      </p>
      <StaticDataTable
        className='rounded-md border'
        tableClassName={
          props.compact
            ? '[&_td]:text-xs [&_td_*]:text-xs [&_th]:text-xs [&_th_*]:text-xs'
            : 'text-sm'
        }
        headerRowClassName='hover:bg-transparent'
        data={props.pricing.rows}
        getRowKey={(row) => row.key}
        getRowClassName={(row) =>
          cn(
            props.matchedTierLabel &&
              row.labels.includes(props.matchedTierLabel) &&
              'bg-emerald-50/70 hover:bg-emerald-50/70 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/10'
          )
        }
        columns={[
          {
            id: 'tier',
            header: t('Tier'),
            className: 'text-muted-foreground py-2 font-medium',
            cellClassName: 'py-2 whitespace-normal break-words',
            cell: (row) => (
              <span className='flex flex-wrap items-center gap-1.5'>
                <span>{paramTierRowLabel(row, t)}</span>
                {props.pricing.defaultLabel &&
                  row.labels.includes(props.pricing.defaultLabel) && (
                    <Badge variant='secondary'>{t('Default tier')}</Badge>
                  )}
                {props.matchedTierLabel &&
                  row.labels.includes(props.matchedTierLabel) && (
                    <Badge
                      variant='secondary'
                      className='bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                    >
                      {t('Matched')}
                    </Badge>
                  )}
              </span>
            ),
          },
          {
            id: 'price',
            header: t(
              props.pricing.perImage ? 'Price per image' : 'Price per request'
            ),
            className: 'text-muted-foreground py-2 text-right font-medium',
            cellClassName: 'py-2 text-right font-mono tabular-nums',
            cell: (row) => props.formatPrice(row.price),
          },
          ...(hasReferences
            ? [
                {
                  id: 'references',
                  header: t('Reference images'),
                  className:
                    'text-muted-foreground py-2 text-right font-medium',
                  cellClassName:
                    'py-2 text-right font-mono whitespace-normal tabular-nums',
                  cell: (row: ParamTierRow) =>
                    row.referenceStep === undefined ? (
                      '-'
                    ) : (
                      <span className='flex flex-col items-end'>
                        <span>
                          {t('+{{price}} each', {
                            price: props.formatPrice(row.referenceStep),
                          })}
                        </span>
                        <span className='text-muted-foreground font-sans text-xs'>
                          {t('up to {{count}}', { count: row.maxReferences })}
                        </span>
                      </span>
                    ),
                },
              ]
            : []),
        ]}
      />
    </div>
  )
}
