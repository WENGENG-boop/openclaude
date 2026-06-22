/**
 * Weo brand identity — single source of truth for the product name, tagline,
 * accent color, and wordmark art used across the TUI.
 *
 * The accent MUST stay in `rgb(r,g,b)` form (never hex): the spinner's
 * shimmer/stall interpolation parses theme values with `parseRGB`, which only
 * matches `rgb(...)` strings.
 */

export const BRAND_NAME = 'Weo'

export const BRAND_TAGLINE = 'Your terminal, powered by Weo'

/** Weo accent in the rgb() form required by theme consumers. */
export const BRAND_ACCENT_RGB = 'rgb(255,122,26)'

/**
 * Two-row Unicode half-block wordmark, split so the two halves can be
 * rendered in different accent shades. Block characters (█ ▀ ▄) render
 * correctly in Apple Terminal. Rendered side by side with a 1-col gap:
 *
 *   █ █ █▀▀ █▀█
 *   ▀▄▀ █▄▄ █▄█
 *
 * The first half is the "W"; the second is "EO". The two-export shape is kept
 * for the dual-shade renderers in LogoV2/CondensedLogo.
 */
export const WORDMARK_OPEN = [
  '█ █',
  '▀▄▀',
] as const

export const WORDMARK_CLAUDE = [
  '█▀▀ █▀█',
  '█▄▄ █▄█',
] as const

/** Rendered width of the full wordmark: first half + 1-col gap + second half. */
export const WORDMARK_WIDTH =
  WORDMARK_OPEN[0].length + 1 + WORDMARK_CLAUDE[0].length
