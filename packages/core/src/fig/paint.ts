import type { Effect, Paint } from '../design/model.ts'
import { guidToId, type RawNode } from './raw.ts'

export const round = (value: number, precision = 2) => {
  const factor = 10 ** precision
  return Math.round((value + Number.EPSILON) * factor) / factor
}

const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value * 255)))

export function toHex(color: RawNode): string {
  return '#' + [color.r, color.g, color.b].map((c) => channel(c).toString(16).padStart(2, '0')).join('')
}

/** CSS colour keeping the alpha channel, used where no separate opacity exists. */
export function toCssColor(color: RawNode | undefined, opacity = 1): string {
  if (!color) return '#000000'
  const alpha = round((color.a ?? 1) * opacity, 3)
  if (alpha >= 1) return toHex(color)
  return `rgba(${channel(color.r)}, ${channel(color.g)}, ${channel(color.b)}, ${alpha})`
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Figma stores a gradient as the matrix mapping the layer's unit square onto
 * gradient space. Inverting it gives the start and end handles, hence the angle.
 */
function gradientAngle(transform: RawNode | undefined, size: { x: number; y: number }): number {
  if (!transform) return 180
  const { m00, m01, m02, m10, m11, m12 } = transform
  const det = m00 * m11 - m01 * m10
  if (!det) return 180
  const invert = (x: number, y: number) => ({
    x: ((m11 * (x - m02) - m01 * (y - m12)) / det) * size.x,
    y: ((-m10 * (x - m02) + m00 * (y - m12)) / det) * size.y,
  })
  const start = invert(0, 0.5)
  const end = invert(1, 0.5)
  const degrees = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI + 90
  return round(((degrees % 360) + 360) % 360, 1)
}

export type MediaSink = (hash: string, bytes: Uint8Array | undefined) => void

export function normalizePaints(
  paints: RawNode[] | undefined,
  size: { x: number; y: number },
  blobs: Uint8Array[],
  onMedia: MediaSink,
): Paint[] {
  const result: Paint[] = []
  for (const paint of paints ?? []) {
    if (paint.visible === false) continue
    const opacity = round(paint.opacity ?? 1, 3)

    if (paint.type === 'SOLID') {
      const variable = guidToId(paint.colorVar?.value?.alias?.guid)
      result.push({
        type: 'SOLID',
        color: toHex(paint.color ?? {}),
        opacity: round(opacity * (paint.color?.a ?? 1), 3),
        ...(variable && { variable }),
      })
    } else if (typeof paint.type === 'string' && paint.type.startsWith('GRADIENT')) {
      result.push({
        type: paint.type as 'GRADIENT_LINEAR',
        stops: (paint.stops ?? []).map((stop: RawNode) => ({
          color: toCssColor(stop.color),
          position: round(stop.position ?? 0, 4),
        })),
        opacity,
        angle: gradientAngle(paint.transform, size),
      })
    } else if (paint.type === 'IMAGE' || paint.type === 'VIDEO') {
      const source = paint.type === 'VIDEO' ? (paint.video ?? paint.image) : paint.image
      if (!source?.hash) continue
      const hash = bytesToHex(source.hash)
      onMedia(hash, typeof source.dataBlob === 'number' ? blobs[source.dataBlob] : undefined)
      result.push({
        type: paint.type,
        hash,
        scaleMode: paint.imageScaleMode ?? 'FILL',
        opacity,
        ...(paint.altText && { alt: paint.altText }),
      })
    }
  }
  return result
}

const EFFECT_TYPES = new Set(['DROP_SHADOW', 'INNER_SHADOW'])

export function normalizeEffects(effects: RawNode[] | undefined): Effect[] {
  const result: Effect[] = []
  for (const effect of effects ?? []) {
    if (effect.visible === false) continue
    if (EFFECT_TYPES.has(effect.type)) {
      result.push({
        type: effect.type,
        color: toCssColor(effect.color),
        x: round(effect.offset?.x ?? 0),
        y: round(effect.offset?.y ?? 0),
        radius: round(effect.radius ?? 0),
        spread: round(effect.spread ?? 0),
      })
    } else if (effect.type === 'FOREGROUND_BLUR' || effect.type === 'LAYER_BLUR') {
      result.push({ type: 'LAYER_BLUR', radius: round(effect.radius ?? 0) })
    } else if (effect.type === 'BACKGROUND_BLUR') {
      result.push({ type: 'BACKGROUND_BLUR', radius: round(effect.radius ?? 0) })
    }
  }
  return result
}
