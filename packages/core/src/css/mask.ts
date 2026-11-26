import type { DesignNode } from '../design/model.ts'
import { nodeToSvg } from '../render/svg.ts'
import { px } from './color.ts'

/** The layer masking its following siblings, if the container has one. */
export const maskOf = (container: DesignNode) => container.children?.find((child) => child.mask && child.visible !== false)

/**
 * CSS for a Figma mask group. A mask layer is not drawn: it only reveals its
 * siblings through its shape. Vector masks become a CSS mask image, any other
 * mask (a rectangle, a frame) is a rounded clip.
 */
export function maskDeclarations(container: DesignNode): Record<string, string> {
  const mask = maskOf(container)
  if (!mask) return {}
  const { x, y, width, height } = mask.box

  const svg = nodeToSvg({ ...mask, rotation: undefined })
  if (svg.includes('<path')) {
    const image = `url("data:image/svg+xml,${encodeURIComponent(svg.trim())}") ${px(x)} ${px(y)} / ${px(width)} ${px(height)} no-repeat`
    return { '-webkit-mask': image, mask: image }
  }
  const radius = Array.isArray(mask.radius) ? mask.radius.map(px).join(' ') : px(mask.radius ?? 0)
  const inset = [y, container.box.width - x - width, container.box.height - y - height, x].map(px).join(' ')
  return { 'clip-path': `inset(${inset} round ${mask.type === 'ELLIPSE' ? '50%' : radius})` }
}
