/**
 * Typed mirror of tokens.css for JS consumers (charts, OG images, satori poster
 * pipeline — places CSS variables can't reach). Keep in sync with tokens.css.
 */
export const pigments = {
  paper: "#faf8f5",
  ink: "#1a1714",
  madder: "#b3432b",
  indigo: "#2c3e66",
  turmeric: "#d99a2b",
  peepal: "#4a7c59",
} as const;

export const fontStacks = {
  display: `"Fraunces", "Noto Serif Devanagari", Georgia, serif`,
  body: `"Inter", "Noto Sans", "Noto Sans Devanagari", -apple-system, system-ui, sans-serif`,
  mono: `"JetBrains Mono", "Noto Sans Devanagari", ui-monospace, monospace`,
} as const;

export const motion = {
  fastMs: 150,
  baseMs: 200,
  slowMs: 250,
  risePx: 12,
} as const;

/** 1.25 modular type scale (px reference values; CSS uses rem). */
export const typeScale = {
  xs: 12,
  sm: 14,
  ui: 15,
  doc: 17,
  lg: 20,
  xl: 25,
  "2xl": 31.25,
  "3xl": 39.06,
  "4xl": 48.83,
} as const;
