import type { DesignNode, NodePatch, OverrideMap } from './model.ts'
import type { NodeIndex } from './traverse.ts'

/**
 * Figma does not store the layers of an instance: they are the component's
 * layers plus a table of overrides. Expanding materialises them, giving every
 * derived layer the id Figma itself uses (`I<instance>;<layer>`).
 */

interface Scope {
  overrides: OverrideMap
  props: Record<string, string | boolean>
  /** Ids of the nested instances crossed since this scope's instance. */
  trail: string[]
}

/** Properties an instance takes from its component when it does not set them. */
const INHERITED = ['fills', 'stroke', 'radius', 'effects', 'clips', 'layout', 'opacity', 'blendMode'] as const
const MAX_DEPTH = 16

function applyPatch(node: DesignNode, patch: NodePatch | undefined): DesignNode {
  if (!patch) return node
  const next = { ...node, ...patch } as DesignNode
  next.box = { ...node.box, ...patch.box }
  // Text and instance patches only make sense on layers that already are one.
  if (node.text) next.text = { ...node.text, ...patch.text, style: { ...node.text.style, ...patch.text?.style } }
  else delete next.text
  if (node.instance) next.instance = { ...node.instance, ...patch.instance }
  else delete next.instance
  return next
}

function applyProps(node: DesignNode, props: Record<string, string | boolean>): DesignNode {
  if (!node.propRefs) return node
  const next = { ...node }
  for (const [field, propId] of Object.entries(node.propRefs)) {
    const value = props[propId]
    if (value === undefined) continue
    if (field === 'VISIBLE' && typeof value === 'boolean') next.visible = value
    if (field === 'TEXT_DATA' && typeof value === 'string' && next.text) next.text = { ...next.text, characters: value }
    if (field === 'OVERRIDDEN_SYMBOL_ID' && typeof value === 'string' && next.instance) {
      next.instance = { ...next.instance, componentId: value }
    }
  }
  return next
}

function expand(node: DesignNode, index: NodeIndex, scopes: Scope[], prefix: string, depth: number): DesignNode {
  let current = node
  if (scopes.length) {
    // Innermost scope first, so that the outermost instance has the last word.
    for (const scope of scopes) current = applyPatch(current, scope.overrides[[...scope.trail, node.id].join('/')])
    current = applyProps(current, scopes[0]!.props)
    current = { ...current, id: `I${prefix};${node.id}`, derived: true }
  }

  const component = current.instance && index.get(current.instance.componentId)
  if (!component || depth >= MAX_DEPTH) {
    if (!current.children) return current
    return { ...current, children: current.children.map((child) => expand(child, index, scopes, prefix, depth)) }
  }

  const own: Scope = { overrides: current.instance!.overrides ?? {}, props: current.instance!.props ?? {}, trail: [] }
  for (const key of INHERITED) {
    if (current[key] === undefined && component[key] !== undefined) current = { ...current, [key]: component[key] }
  }
  // An override addressed to the component itself restyles the instance root.
  if (own.overrides[component.id]) {
    const rootPatch = { ...own.overrides[component.id] }
    delete rootPatch.box
    delete rootPatch.name
    current = applyPatch(current, rootPatch)
  }

  const nested = [own, ...scopes.map((scope) => ({ ...scope, trail: [...scope.trail, node.id] }))]
  const childPrefix = scopes.length ? `${prefix};${node.id}` : node.id
  return {
    ...current,
    children: (component.children ?? []).map((child) => expand(child, index, nested, childPrefix, depth + 1)),
  }
}

/** Returns a copy of `node` where every instance carries its resolved layers. */
export function expandInstances(node: DesignNode, index: NodeIndex): DesignNode {
  return expand(node, index, [], '', 0)
}

/** Id of the component layer a derived layer comes from. */
export function sourceIdOf(id: string): string {
  return id.startsWith('I') ? id.slice(id.lastIndexOf(';') + 1) : id
}
