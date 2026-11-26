import type { DesignDocument } from '../design/model.ts'
import { slugify } from '../design/traverse.ts'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

export interface ScreenVariant {
  breakpoint: Breakpoint
  width: number
  height: number
  nodeId: string
  frameName: string
  page: string
}

export interface Screen {
  name: string
  /** Suggested Nuxt route, e.g. `/` or `/pricing`. */
  route: string
  variants: ScreenVariant[]
}

const DEVICE_WORDS = /\b(desktop|laptop|web|mobile|phone|tablet|ipad|iphone|android|xs|sm|md|lg|xl|xxl|\d{3,4}(px)?)\b/gi
const MIN_SCREEN_WIDTH = 280
/** Frames and pages designers add for the file browser, not for the site. */
const NOT_A_SCREEN = /^(thumbnail|cover|readme|changelog|style ?guide|components?|assets?|icons?)$/i

export function breakpointOf(width: number): Breakpoint {
  if (width < 600) return 'mobile'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

/** `Home / Desktop`, `Home – 375`, `Home (mobile)` all name the screen `Home`. */
function screenName(frameName: string): string {
  const name = frameName
    .replace(DEVICE_WORDS, ' ')
    .replace(/[()[\]]/g, ' ')
    .replace(/\s*[-–—/|_:]+\s*$/g, '')
    .replace(/^\s*[-–—/|_:]+\s*/g, '')
    .replace(/\s+[-–—/|_:]+\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return name || frameName.trim()
}

/**
 * Groups top-level frames into screens: frames sharing a name once device
 * words are removed are the responsive variants of one page.
 */
export function extractScreens(document: DesignDocument): Screen[] {
  const screens = new Map<string, Screen>()
  for (const page of document.pages) {
    if (page.internal || NOT_A_SCREEN.test(page.name.trim())) continue
    for (const frame of page.children) {
      if (frame.type !== 'FRAME' || frame.visible === false || frame.box.width < MIN_SCREEN_WIDTH) continue
      if (NOT_A_SCREEN.test(frame.name.trim())) continue
      if (frame.box.height < frame.box.width / 4) continue
      const name = screenName(frame.name)
      const slug = slugify(name)
      const screen = screens.get(slug) ?? { name, route: /^(home|index|landing|accueil)?$/.test(slug) ? '/' : `/${slug}`, variants: [] }
      screen.variants.push({
        breakpoint: breakpointOf(frame.box.width),
        width: frame.box.width,
        height: frame.box.height,
        nodeId: frame.id,
        frameName: frame.name,
        page: page.name,
      })
      screens.set(slug, screen)
    }
  }
  for (const screen of screens.values()) screen.variants.sort((a, b) => b.width - a.width)
  return [...screens.values()]
}

/** The frame that best shows the project: the widest variant of the home screen. */
export function coverFrame(screens: Screen[]): ScreenVariant | undefined {
  return (screens.find((screen) => screen.route === '/') ?? screens[0])?.variants[0]
}

/** Distinct design widths per breakpoint, i.e. the widths to verify the build at. */
export function breakpointWidths(screens: Screen[]): Partial<Record<Breakpoint, number[]>> {
  const widths: Partial<Record<Breakpoint, number[]>> = {}
  for (const variant of screens.flatMap((screen) => screen.variants)) {
    const list = (widths[variant.breakpoint] ??= [])
    if (!list.includes(variant.width)) list.push(variant.width)
  }
  return widths
}
