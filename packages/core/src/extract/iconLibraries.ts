/**
 * Known icon libraries and how to recognise them in a Figma file.
 *
 * A .fig file does not record which community library an icon came from, so
 * detection relies on what survives the copy: the naming convention of the
 * components and, for libraries shipped as variant sets, the variant values.
 * `prefix` is the Iconify collection, usable as-is with `@nuxt/icon`.
 */
export interface IconLibrary {
  id: string
  name: string
  /** Iconify collection prefix (`<Icon name="prefix:icon-name" />`). */
  prefix: string
  /** Matches a component, set, frame or page name. */
  pattern: RegExp
  /** Variant values that identify the library even when names do not. */
  variants?: { property: string; values: string[] }
  /** Maps a variant value to the suffix Iconify appends to the icon name. */
  suffix?: (variant: string) => string
}

const phosphorSuffix = (weight: string) => (weight.toLowerCase() === 'regular' ? '' : `-${weight.toLowerCase()}`)

export const ICON_LIBRARIES: IconLibrary[] = [
  { id: 'phosphor', name: 'Phosphor', prefix: 'ph', pattern: /\bphosphor\b|^ph[:/]/i, variants: { property: 'Weight', values: ['Thin', 'Light', 'Regular', 'Bold', 'Fill', 'Duotone'] }, suffix: phosphorSuffix },
  { id: 'lucide', name: 'Lucide', prefix: 'lucide', pattern: /\blucide\b/i },
  { id: 'heroicons', name: 'Heroicons', prefix: 'heroicons', pattern: /\bhero\s?icons?\b/i, variants: { property: 'Style', values: ['Outline', 'Solid', 'Mini', 'Micro'] } },
  { id: 'tabler', name: 'Tabler Icons', prefix: 'tabler', pattern: /\btabler\b/i },
  { id: 'material-symbols', name: 'Material Symbols', prefix: 'material-symbols', pattern: /\bmaterial[\s-]?symbols?\b/i, variants: { property: 'Style', values: ['Outlined', 'Rounded', 'Sharp'] } },
  { id: 'mdi', name: 'Material Design Icons', prefix: 'mdi', pattern: /\bmdi\b|\bmaterial[\s-]?(design[\s-]?)?icons?\b/i },
  { id: 'feather', name: 'Feather', prefix: 'feather', pattern: /\bfeather\b/i },
  { id: 'font-awesome', name: 'Font Awesome', prefix: 'fa6-solid', pattern: /\bfont[\s-]?awesome\b|^fa[srlb]?[-/ ]/i },
  { id: 'remix', name: 'Remix Icon', prefix: 'ri', pattern: /\bremix\s?icons?\b|^ri[:/]/i },
  { id: 'bootstrap', name: 'Bootstrap Icons', prefix: 'bi', pattern: /\bbootstrap\b|^bi[:/]/i },
  { id: 'ionicons', name: 'Ionicons', prefix: 'ion', pattern: /\bionicons?\b/i },
  { id: 'iconsax', name: 'Iconsax', prefix: 'iconsax', pattern: /\biconsax\b|^vuesax\b/i, variants: { property: 'Style', values: ['Linear', 'Outline', 'Bold', 'Bulk', 'Broken', 'TwoTone'] } },
  { id: 'solar', name: 'Solar', prefix: 'solar', pattern: /\bsolar\b/i, variants: { property: 'Style', values: ['Linear', 'Outline', 'Bold', 'Bold Duotone', 'Line Duotone', 'Broken'] } },
  { id: 'carbon', name: 'Carbon', prefix: 'carbon', pattern: /\bcarbon\b/i },
  { id: 'radix', name: 'Radix Icons', prefix: 'radix-icons', pattern: /\bradix\b/i },
  { id: 'hugeicons', name: 'Hugeicons', prefix: 'hugeicons', pattern: /\bhuge\s?icons?\b/i },
  { id: 'iconoir', name: 'Iconoir', prefix: 'iconoir', pattern: /\biconoir\b/i },
  { id: 'fluent', name: 'Fluent UI System Icons', prefix: 'fluent', pattern: /\bfluent\b/i },
  { id: 'simple-icons', name: 'Simple Icons', prefix: 'simple-icons', pattern: /\bsimple[\s-]?icons\b/i },
]

/** Font families that are icon fonts rather than text faces. */
export const ICON_FONTS: { pattern: RegExp; library: string }[] = [
  { pattern: /^font awesome/i, library: 'font-awesome' },
  { pattern: /^material symbols/i, library: 'material-symbols' },
  { pattern: /^material icons/i, library: 'mdi' },
  { pattern: /^phosphor/i, library: 'phosphor' },
  { pattern: /^remixicon/i, library: 'remix' },
  { pattern: /^bootstrap-icons/i, library: 'bootstrap' },
]
