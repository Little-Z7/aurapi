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
import { compileBillingExpression } from './billing-expression/parser'
import { evaluateBillingExpression } from './billing-expression/runtime'
import {
  expressionDependencies,
  visitExpression,
  type ExpressionNode,
} from './billing-expression/types'

export type ParamTierRow = {
  key: string
  /** Tier label split on `_`, without the reference-count part. */
  labelParts: string[]
  /** Set when the row is one point of a reference-count series that is not linear. */
  references?: number
  price: number
  /** Linear reference-count series: price for zero references plus this per reference. */
  referenceStep?: number
  maxReferences?: number
  /** Every tier label the row stands for, so a matched log tier can be found. */
  labels: string[]
}

export type ParamTierPricing = {
  rows: ParamTierRow[]
  perImage: boolean
  minPrice: number
  maxPrice: number
  /** Tier an empty request settles on; absent when the empty request cannot be evaluated. */
  defaultLabel?: string
  defaultPrice?: number
  /** Request parameters the branch conditions read, in source order. */
  params: string[]
}

const CONDITION_FUNCTIONS = new Set(['param', 'header', 'has'])
const REFERENCE_PART = /^r(\d+)$/
const PRICE_EPSILON = 1e-9

function collectFixedLeaves(
  node: ExpressionNode,
  leaves: Map<string, number>
): boolean {
  if (node.kind === 'conditional') {
    const dependencies = expressionDependencies(node.condition)
    if (
      dependencies.variables.size > 0 ||
      [...dependencies.functions].some((name) => !CONDITION_FUNCTIONS.has(name))
    ) {
      return false
    }
    return (
      collectFixedLeaves(node.yes, leaves) &&
      collectFixedLeaves(node.no, leaves)
    )
  }
  if (
    node.kind !== 'call' ||
    node.name !== 'tier' ||
    node.args[0].kind !== 'literal' ||
    typeof node.args[0].value !== 'string'
  ) {
    return false
  }
  const body = node.args[1]
  if (
    body.kind !== 'call' ||
    body.name !== 'fixed' ||
    body.args[0].kind !== 'literal' ||
    typeof body.args[0].value !== 'number' ||
    body.args[0].value < 0
  ) {
    return false
  }
  const label = node.args[0].value
  const price = body.args[0].value
  const existing = leaves.get(label)
  if (existing !== undefined && existing !== price) return false
  leaves.set(label, price)
  return true
}

function groupReferenceSeries(leaves: Map<string, number>): ParamTierRow[] {
  const rows: ParamTierRow[] = []
  const series = new Map<
    string,
    { parts: string[]; points: [number, string, number][] }
  >()
  for (const [label, price] of leaves) {
    const parts = label.split('_')
    const index = parts.findIndex((part) => REFERENCE_PART.test(part))
    if (index < 0) {
      rows.push({ key: label, labelParts: parts, price, labels: [label] })
      continue
    }
    const references = Number(parts[index].slice(1))
    const rest = parts.filter((_, i) => i !== index)
    const key = rest.join('_')
    const entry = series.get(key) ?? { parts: rest, points: [] }
    entry.points.push([references, label, price])
    series.set(key, entry)
  }
  for (const [key, entry] of series) {
    const points = entry.points.sort((a, b) => a[0] - b[0])
    const step = points.length > 1 ? points[1][2] - points[0][2] : 0
    const linear =
      points.length > 1 &&
      points.every(
        ([references, , price], i) =>
          references === i &&
          Math.abs(price - points[0][2] - step * i) <= PRICE_EPSILON
      )
    if (linear) {
      rows.push({
        key,
        labelParts: entry.parts,
        price: points[0][2],
        referenceStep: step,
        maxReferences: points.at(-1)?.[0],
        labels: points.map(([, label]) => label),
      })
      continue
    }
    for (const [references, label, price] of points) {
      rows.push({
        key: label,
        labelParts: entry.parts,
        references,
        price,
        labels: [label],
      })
    }
  }
  // Stable: rows with equal prices keep their source order.
  return rows.sort((a, b) => a.price - b.price)
}

/**
 * Reads per-call prices chosen by request parameters, such as image quality,
 * resolution or the number of reference images. Every branch condition may
 * only read the request, and every leaf must be `tier(name, fixed(amount))`,
 * optionally multiplied by `image_count`. Anything else returns null and keeps
 * the special-expression fallback.
 */
export function readParamTierPricing(source: string): ParamTierPricing | null {
  const compiled = compileBillingExpression(source)
  if (compiled.status !== 'ready') return null
  let tree = compiled.ast
  let perImage = false
  if (tree.kind === 'binary' && tree.operator === '*') {
    if (tree.right.kind === 'variable' && tree.right.name === 'image_count') {
      tree = tree.left
      perImage = true
    } else if (
      tree.left.kind === 'variable' &&
      tree.left.name === 'image_count'
    ) {
      tree = tree.right
      perImage = true
    }
  }
  if (tree.kind !== 'conditional') return null
  const leaves = new Map<string, number>()
  if (!collectFixedLeaves(tree, leaves) || leaves.size < 2) return null

  const params: string[] = []
  visitExpression(tree, (node) => {
    if (
      node.kind === 'call' &&
      node.name === 'param' &&
      node.args[0].kind === 'literal' &&
      typeof node.args[0].value === 'string' &&
      !params.includes(node.args[0].value.trim())
    ) {
      params.push(node.args[0].value.trim())
    }
  })

  const prices = [...leaves.values()]
  const result: ParamTierPricing = {
    rows: groupReferenceSeries(leaves),
    perImage,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    params,
  }
  const empty = evaluateBillingExpression(compiled, {
    request: { body: {}, headers: {} },
    imageCount: 1,
  })
  if (
    empty.status === 'success' &&
    empty.fixedPrice !== undefined &&
    leaves.has(empty.matchedTier)
  ) {
    result.defaultLabel = empty.matchedTier
    result.defaultPrice = empty.fixedPrice
  }
  return result
}
