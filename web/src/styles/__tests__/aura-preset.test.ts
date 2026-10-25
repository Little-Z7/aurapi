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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { THEME_PRESETS } from '@/lib/theme-customization'

const css = readFileSync(
  resolve(import.meta.dirname, '../theme-presets.css'),
  'utf8'
)

describe('aura theme preset stylesheet', () => {
  it('is registered as a selectable preset', () => {
    expect(THEME_PRESETS.map((preset) => preset.value)).toContain('aura')
  })

  it('opts out of both semantic surface bridge selectors so surfaces stay warm', () => {
    // Without the opt-out the (0,3,0) bridge selector beats the preset block
    // and tints every card, border and sidebar with the primary color.
    const bridgeSelectors = css
      .split('\n')
      .join(' ')
      .match(
        /\[data-theme-preset\]:not\(\[data-theme-preset='default'\]\):not\([^{]*\{/g
      )

    expect(bridgeSelectors).toHaveLength(2)
    for (const selector of bridgeSelectors ?? []) {
      expect(selector).toContain(":not([data-theme-preset='aura'])")
    }
  })

  it.each([
    ['light', "[data-theme-preset='aura'] {"],
    ['dark', ".dark [data-theme-preset='aura'] {"],
  ])(
    'declares the %s token block with a warm canvas and a blue primary',
    (_mode, selector) => {
      const start = css.indexOf(`\n${selector}`)
      expect(start).toBeGreaterThan(-1)
      const block = css.slice(start, css.indexOf('\n}', start))

      expect(block).toMatch(/--background:\s*#[0-9a-f]{6}/i)
      expect(block).toMatch(/--primary:\s*#[0-9a-f]{6}/i)
      expect(block).toContain('--sidebar:')
    }
  )

  it('removes the card outline and only declares border-color and box-shadow', () => {
    const rule = css.match(
      /\[data-theme-preset='aura'\] \[data-slot='card'\] \{([^}]*)\}/
    )?.[1]

    expect(rule).toBeDefined()
    const properties = [...(rule ?? '').matchAll(/([a-z-]+)\s*:/g)].map(
      (match) => match[1]
    )
    expect(properties).toEqual(['border-color', 'box-shadow'])
  })
})
