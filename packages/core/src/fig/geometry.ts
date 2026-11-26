const round = (value: number) => Math.round(value * 1000) / 1000

/** Number of float32 arguments following each command byte. */
const COMMANDS: Record<number, { letter: string; args: number }> = {
  0: { letter: 'Z', args: 0 },
  1: { letter: 'M', args: 2 },
  2: { letter: 'L', args: 2 },
  3: { letter: 'Q', args: 4 },
  4: { letter: 'C', args: 6 },
}

/** Converts a Figma path command blob into an SVG path `d` attribute. */
export function blobToSvgPath(blob: Uint8Array | undefined): string {
  if (!blob) return ''
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength)
  const parts: string[] = []
  let offset = 0
  while (offset < blob.length) {
    const command = COMMANDS[blob[offset]!]
    offset += 1
    if (!command || offset + command.args * 4 > blob.length) break
    const args: number[] = []
    for (let i = 0; i < command.args; i++) {
      args.push(round(view.getFloat32(offset, true)))
      offset += 4
    }
    parts.push(command.letter + args.join(' '))
  }
  return parts.join('')
}
