const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })

export const formatDate = (iso: string) => dateFormat.format(new Date(iso))

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

export const pad = (value: number) => String(value).padStart(2, '0')

/** `true` when a hex or rgb colour is light enough to need dark text on top. */
export function isLight(color: string): boolean {
  const channels = color.startsWith('#')
    ? [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16))
    : (color.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number)
  const [r = 0, g = 0, b = 0] = channels
  return (r * 299 + g * 587 + b * 114) / 1000 > 150
}

export const isColor = (value: unknown): value is string => typeof value === 'string' && /^(#[0-9a-f]{6}|rgba?\()/i.test(value)

/** Google Fonts stylesheet URL for the given families, used to draw specimens. */
export function fontStylesheet(families: { family: string; weights: number[] }[]): string {
  const query = families
    .map(({ family, weights }) => `family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${[...weights].sort((a, b) => a - b).join(';')}`)
    .join('&')
  return `https://fonts.googleapis.com/css2?${query}&display=swap`
}
