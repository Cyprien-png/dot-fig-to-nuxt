/** Applies an opacity to a `#rrggbb` colour, returning the shortest CSS form. */
export function colorWithOpacity(hex: string, opacity: number): string {
  if (opacity >= 1) return hex
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

export const px = (value: number) => (value === 0 ? '0' : `${Math.round(value * 100) / 100}px`)
