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

import { evaluateBillingExpression } from '../lib/billing-expression/runtime'
import { readParamTierPricing } from '../lib/param-tier-pricing'

const GPT_IMAGE_2 =
  '(param("quality") == "low" ? tier("low", fixed(0.018)) : (param("quality") == "high" ? tier("high", fixed(0.608)) : tier("medium", fixed(0.154)))) * image_count'

const SIZE_2K =
  '(param("resolution") == "2K" || param("size") == "2K" || param("size") == "2k" || has(param("size"), "x") || has(param("size"), "X"))'

const GROK_IMAGINE = `((param("input_reference_count") ?? 0) > 0 ? (param("quality") == "low" ? (${SIZE_2K} ? (tier("i2i_low_2K", fixed(0.26))) : (tier("i2i_low_1K", fixed(0.202)))) : (${SIZE_2K} ? (tier("i2i_medium_2K", fixed(0.318))) : (tier("i2i_medium_1K", fixed(0.26))))) : (param("quality") == "low" ? (${SIZE_2K} ? (tier("t2i_low_2K", fixed(0.174))) : (tier("t2i_low_1K", fixed(0.116)))) : (${SIZE_2K} ? (tier("t2i_medium_2K", fixed(0.232))) : (tier("t2i_medium_1K", fixed(0.174)))))) * image_count`

const RIVERFLOW_FAST = `(${SIZE_2K} ? ((param("input_reference_count") ?? 0) < 1 ? tier("2K_r0", fixed(0.062)) : ((param("input_reference_count") ?? 0) < 2 ? tier("2K_r1", fixed(0.108)) : ((param("input_reference_count") ?? 0) < 3 ? tier("2K_r2", fixed(0.154)) : ((param("input_reference_count") ?? 0) < 4 ? tier("2K_r3", fixed(0.2)) : (tier("2K_r4", fixed(0.246))))))) : ((param("input_reference_count") ?? 0) < 1 ? tier("1K_r0", fixed(0.056)) : ((param("input_reference_count") ?? 0) < 2 ? tier("1K_r1", fixed(0.102)) : ((param("input_reference_count") ?? 0) < 3 ? tier("1K_r2", fixed(0.148)) : ((param("input_reference_count") ?? 0) < 4 ? tier("1K_r3", fixed(0.194)) : (tier("1K_r4", fixed(0.24)))))))) * image_count`

// GPT Image 2.5 Flare shape: quality branches, each a 0..16 reference-count chain.
function referenceChain(quality: string, base: number, max: number): string {
  let chain = `tier("${quality}_r${max}", fixed(${(base + 0.036 * max).toFixed(3)}))`
  for (let count = max - 1; count >= 0; count--) {
    chain = `((param("input_reference_count") ?? 0) < ${count + 1} ? tier("${quality}_r${count}", fixed(${(base + 0.036 * count).toFixed(3)})) : ${chain})`
  }
  return chain
}
const FLARE = `(param("quality") == "low" ? ${referenceChain('low', 0.018, 16)} : (param("quality") == "high" ? ${referenceChain('high', 0.154, 16)} : ${referenceChain('medium', 0.044, 16)})) * image_count`

describe('readParamTierPricing', () => {
  it('lists quality tiers sorted by price with the empty-request tier as default', () => {
    const pricing = readParamTierPricing(GPT_IMAGE_2)
    expect(pricing).not.toBeNull()
    expect(pricing?.perImage).toBe(true)
    expect(pricing?.rows.map((row) => [row.labelParts, row.price])).toEqual([
      [['low'], 0.018],
      [['medium'], 0.154],
      [['high'], 0.608],
    ])
    expect(pricing?.defaultLabel).toBe('medium')
    expect(pricing?.defaultPrice).toBe(0.154)
    expect(pricing?.params).toEqual(['quality'])
    expect([pricing?.minPrice, pricing?.maxPrice]).toEqual([0.018, 0.608])
  })

  it('collapses linear reference-count chains into one row per quality', () => {
    const pricing = readParamTierPricing(FLARE)
    expect(pricing?.rows).toHaveLength(3)
    const low = pricing?.rows[0]
    expect(low?.labelParts).toEqual(['low'])
    expect(low?.price).toBe(0.018)
    expect(low?.referenceStep).toBeCloseTo(0.036, 9)
    expect(low?.maxReferences).toBe(16)
    expect(low?.labels).toContain('low_r5')
    expect(pricing?.defaultLabel).toBe('medium_r0')
    expect(pricing?.params).toEqual(['quality', 'input_reference_count'])
  })

  it('keeps resolution labels and reference series for Riverflow', () => {
    const pricing = readParamTierPricing(RIVERFLOW_FAST)
    expect(
      pricing?.rows.map((row) => [row.key, row.price, row.maxReferences])
    ).toEqual([
      ['1K', 0.056, 4],
      ['2K', 0.062, 4],
    ])
    expect(pricing?.rows[0].referenceStep).toBeCloseTo(0.046, 9)
    expect(pricing?.defaultLabel).toBe('1K_r0')
  })

  it('reads every Grok mode, quality and size combination', () => {
    const pricing = readParamTierPricing(GROK_IMAGINE)
    expect(pricing?.rows).toHaveLength(8)
    expect(pricing?.rows[0].key).toBe('t2i_low_1K')
    expect(pricing?.rows.at(-1)?.key).toBe('i2i_medium_2K')
    expect(pricing?.defaultLabel).toBe('t2i_medium_1K')
    expect(pricing?.params).toEqual([
      'input_reference_count',
      'quality',
      'resolution',
      'size',
    ])
  })

  it('rejects branches whose leaves are not fixed prices', () => {
    expect(
      readParamTierPricing(
        'param("premium") == true ? tier("premium", p * 2) : tier("base", p)'
      )
    ).toBeNull()
  })

  it('rejects a single fixed tier', () => {
    expect(
      readParamTierPricing('tier("base", fixed(0.1)) * image_count')
    ).toBeNull()
  })
})

describe('nil coalescing in billing expressions', () => {
  it('uses the fallback only when the request omits the parameter', () => {
    const omitted = evaluateBillingExpression(FLARE, {
      request: { body: { quality: 'low' }, headers: {} },
      imageCount: 1,
    })
    const present = evaluateBillingExpression(FLARE, {
      request: {
        body: { quality: 'low', input_reference_count: 2 },
        headers: {},
      },
      imageCount: 1,
    })
    expect(omitted.status === 'success' && omitted.matchedTier).toBe('low_r0')
    expect(present.status === 'success' && present.matchedTier).toBe('low_r2')
    expect(present.status === 'success' && present.fixedPrice).toBe(0.09)
  })
})
