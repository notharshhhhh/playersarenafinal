/**
 * Design tokens for the BBG E-Sports look.
 * Single source of truth: every colour, radius, font and shadow used by the UI
 * is defined here. Tokens are also exposed as CSS variables on :root
 * (see applyThemeCssVars, called once from main.tsx) so Tailwind arbitrary
 * values and index.css can use var(--bbg-*).
 */

export const colors = {
  bg: '#050505',
  card: '#141414',
  card2: '#1a1a1a',
  sheet: '#111111',
  orange: '#F37A1F',
  orangeLight: '#FF9A4D',
  gold: '#FFD21F',
  goldTitleFrom: '#E8B92A',
  goldTitleTo: '#B8860B',
  borderOrange: 'rgba(243,122,32,0.45)',
  borderDark: '#2a2a2a',
  text: '#ffffff',
  titleText: '#FFF3E0',
  muted: '#7a7a7a',
  green: '#22C55E',
  red: '#FF3B3B',
  tile: '#151515',
  input: '#111111',
  disabledCta: '#1c1c1c',
  nav: '#1c1c1c',
  hairline: 'rgba(255,255,255,0.06)',
  grid: 'rgba(255,255,255,0.04)',
} as const;

export const radii = {
  card: 30,
  inner: 26,
  tile: 18,
  input: 16,
  button: 14,
  pill: 999,
  sheet: 40,
  modal: 28,
  row: 20,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  navInset: 18,
  gridCell: 40,
} as const;

export const fonts = {
  display: "'Orbitron', 'Michroma', 'Exo 2', sans-serif",
  weights: { medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 },
  googleFontsHref:
    'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600;700;800;900&display=swap',
} as const;

export const shadows = {
  orangeGlow: '0 8px 24px rgba(243,122,32,0.35)',
  buttonGlow: '0 6px 20px rgba(243,122,32,0.40)',
  titleGlow: '0 0 12px rgba(255,160,60,0.5)',
  goldGlow: '0 0 18px rgba(255,210,31,0.45)',
  logoGlow: '0 0 18px rgba(243,122,32,0.45)',
  nav: '0 10px 30px rgba(0,0,0,0.65)',
  selectedPack: '0 0 0 1px rgba(243,122,32,0.6), 0 0 22px rgba(243,122,32,0.22)',
  focusRing: '0 0 0 3px rgba(243,122,32,0.18)',
} as const;

export const gradients = {
  orange: `linear-gradient(135deg, ${colors.orange}, ${colors.orangeLight})`,
  goldTitle: `linear-gradient(90deg, ${colors.goldTitleFrom}, ${colors.goldTitleTo})`,
  banner: 'linear-gradient(180deg, #1c1c1c 0%, #0c0c0c 55%, #000000 100%)',
  cardInner: 'linear-gradient(160deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0) 55%)',
} as const;

export const theme = { colors, radii, spacing, fonts, shadows, gradients } as const;
export type Theme = typeof theme;

/** Writes every token to :root as a --bbg-* CSS variable. Safe to call repeatedly. */
export function applyThemeCssVars(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const set = (name: string, value: string | number) => root.style.setProperty(`--bbg-${name}`, String(value));
  (Object.keys(colors) as (keyof typeof colors)[]).forEach((k) => set(`c-${k}`, colors[k]));
  (Object.keys(radii) as (keyof typeof radii)[]).forEach((k) => set(`r-${k}`, `${radii[k]}px`));
  (Object.keys(shadows) as (keyof typeof shadows)[]).forEach((k) => set(`s-${k}`, shadows[k]));
  (Object.keys(gradients) as (keyof typeof gradients)[]).forEach((k) => set(`g-${k}`, gradients[k]));
  set('font-display', fonts.display);
}
