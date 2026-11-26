import type { DesignDocument, Interaction } from '../design/model.ts'
import { visitDocument, type NodeIndex } from '../design/traverse.ts'

export interface ComponentUsage {
  id: string
  name: string
  /** Variant names when the component is a set. */
  variants: string[]
  properties: string[]
  /** Number of instances placed on the design pages. */
  instances: number
  width: number
  height: number
  /** Remote library key when the component is not local to the file. */
  libraryKey?: string
}

/**
 * Lists the Figma components in use. Each is a strong hint for a Vue
 * component: the designer already decided it is a reusable unit.
 */
export function extractComponents(document: DesignDocument, index: NodeIndex, parents: Map<string, string>): ComponentUsage[] {
  const usage = new Map<string, ComponentUsage>()
  for (const { node } of visitDocument(document)) {
    const component = index.get(node.instance?.componentId ?? '')
    if (!component) continue
    const parent = index.get(parents.get(component.id) ?? '')
    const owner = parent?.type === 'COMPONENT_SET' ? parent : component
    const entry = usage.get(owner.id) ?? {
      id: owner.id,
      name: owner.name,
      variants: owner === parent ? (owner.children ?? []).map((variant) => variant.name) : [],
      properties: (owner.component?.properties ?? []).map((property) => property.name),
      instances: 0,
      width: component.box.width,
      height: component.box.height,
      ...(component.component?.libraryKey && { libraryKey: component.component.libraryKey }),
    }
    entry.instances += 1
    usage.set(owner.id, entry)
  }
  return [...usage.values()].sort((a, b) => b.instances - a.instances || a.name.localeCompare(b.name))
}

export interface InteractionUsage extends Interaction {
  nodeId: string
  nodeName: string
  frame: string
}

/** Prototype interactions: the source of truth for hover states, links and transitions. */
export function extractInteractions(document: DesignDocument): InteractionUsage[] {
  const result: InteractionUsage[] = []
  for (const { node, frame } of visitDocument(document)) {
    for (const interaction of node.interactions ?? []) {
      result.push({ nodeId: node.id, nodeName: node.name, frame: frame.name, ...interaction })
    }
  }
  return result
}
