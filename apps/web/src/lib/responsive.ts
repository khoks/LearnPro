// STORY-025 — viewport breakpoint constants. Tailwind isn't installed in MVP (the build path
// uses inline styles + a `useViewportSize()` hook instead — see ../app/globals.css for the
// "no Tailwind yet" note). When Tailwind lands in v1, swap these values into the Tailwind
// config so component code can keep referencing the same names.
//
// Bands match the spec in STORY-025: mobile <768, tablet 768–1023, laptop 1024+.

export const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
} as const;

export type Breakpoint = "mobile" | "tablet" | "laptop";

export function breakpointFor(width: number): Breakpoint {
  if (width < BREAKPOINTS.mobile) return "mobile";
  if (width < BREAKPOINTS.tablet) return "tablet";
  return "laptop";
}
