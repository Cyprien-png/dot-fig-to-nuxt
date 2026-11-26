import type { DesignDocument, DesignNode, DesignPage } from './model.ts'

export type NodeIndex = Map<string, DesignNode>

export interface Visit {
  node: DesignNode
  parent: DesignNode | undefined
  page: DesignPage
  /** Top-level frame the node belongs to (the node itself when it is one). */
  frame: DesignNode
}

/** Depth-first walk. Return `false` from the visitor to skip a node's children. */
export function walk(node: DesignNode, visit: (node: DesignNode, parent?: DesignNode) => boolean | void, parent?: DesignNode): void {
  if (visit(node, parent) === false) return
  for (const child of node.children ?? []) walk(child, visit, node)
}

export function* visitDocument(document: DesignDocument, options: { internal?: boolean } = {}): Generator<Visit> {
  for (const page of document.pages) {
    if (page.internal && !options.internal) continue
    for (const frame of page.children) {
      const stack: [DesignNode, DesignNode | undefined][] = [[frame, undefined]]
      while (stack.length) {
        const [node, parent] = stack.pop()!
        yield { node, parent, page, frame }
        for (let i = (node.children?.length ?? 0) - 1; i >= 0; i--) stack.push([node.children![i]!, node])
      }
    }
  }
}

/** Indexes every stored node by id, internal page included. */
export function indexDocument(document: DesignDocument): NodeIndex {
  const index: NodeIndex = new Map()
  for (const { node } of visitDocument(document, { internal: true })) index.set(node.id, node)
  return index
}

export function findNode(document: DesignDocument, id: string): Visit | undefined {
  for (const visit of visitDocument(document, { internal: true })) if (visit.node.id === id) return visit
  return undefined
}

/** Human readable name: `Set / Variant` for variants, the layer name otherwise. */
export function componentName(component: DesignNode, index: NodeIndex, parents: Map<string, string>): string {
  const parent = index.get(parents.get(component.id) ?? '')
  return parent?.type === 'COMPONENT_SET' ? parent.name : component.name
}

/** Child id -> parent id, for lookups going up the tree. */
export function parentMap(document: DesignDocument): Map<string, string> {
  const parents = new Map<string, string>()
  for (const { node, parent } of visitDocument(document, { internal: true })) if (parent) parents.set(node.id, parent.id)
  return parents
}

export const slugify = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const camelCase = (value: string) => slugify(value).replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase())
