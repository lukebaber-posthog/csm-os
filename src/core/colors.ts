/**
 * The card palette.
 *
 * Split from the renderer's `lib/colors`, which keeps `cardSurfaceStyle` — that
 * one returns a React `CSSProperties` and is painting rather than data. What is
 * here is the part a headless caller needs: the names a colour can be, and how
 * to turn one into a value.
 */

export const CARD_COLORS = [
  "red",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const;
export type CardColor = (typeof CARD_COLORS)[number];

/**
 * Stored as space-separated RGB so the accent and its tint derive from one
 * value. Mid-tone hues were chosen to stay legible on both the light and dark
 * card surfaces without needing a separate value per theme.
 */
const RGB: Record<CardColor, string> = {
  red: "220 38 38",
  amber: "217 119 6",
  green: "22 163 74",
  teal: "13 148 136",
  blue: "37 99 235",
  violet: "124 58 237",
  pink: "219 39 119",
};

export const LABELS: Record<CardColor, string> = {
  red: "Red",
  amber: "Amber",
  green: "Green",
  teal: "Teal",
  blue: "Blue",
  violet: "Violet",
  pink: "Pink",
};

/** Full-strength hue, for swatches in the colour picker. */
export const accentOf = (color: CardColor): string => `rgb(${RGB[color]})`;

/**
 * The raw space-separated triple, for call sites that need to interpolate their
 * own alpha. A narrow accessor rather than exporting the map, matching accentOf.
 */
export const rgbOf = (color: CardColor): string => RGB[color];

/**
 * Hex form of the same hue.
 *
 * canvas-confetti parses hex only: hand it accentOf()'s `rgb(220 38 38)` and its
 * internal hexToRgb regex misses, every channel comes back NaN, and the
 * particles render as black squares.
 */
export function hexOf(color: CardColor): string {
  return (
    "#" +
    RGB[color]
      .split(" ")
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Rainbow confetti, drawn from the card palette rather than from a stock set.
 *
 * These are the same seven hues a card can be tinted with, so a burst still looks
 * like it came out of this app — but all seven fire at once, which is what makes
 * it read as confetti. The earlier version used the card's own hue plus two greys
 * from the theme, and that was a mistake: an uncoloured to-do got greys alone, so
 * small near-black and grey squares on a white page were effectively invisible
 * and the celebration looked like it had not fired at all.
 *
 * Hex because canvas-confetti parses nothing else — see hexOf.
 */
export function particleColors(): string[] {
  return CARD_COLORS.map(hexOf);
}

export function isCardColor(value: unknown): value is CardColor {
  return (
    typeof value === "string" &&
    (CARD_COLORS as readonly string[]).includes(value)
  );
}
