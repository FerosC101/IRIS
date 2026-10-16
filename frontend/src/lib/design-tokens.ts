/** Canvas renderers cannot resolve CSS variables. Keep these literals aligned
 * with index.css; use CSS variables for DOM/SVG surfaces whenever possible. */
export const IRIS_COLORS = {
  background: "#04121C",
  surface: "#0A3A4A",
  deep: "#0E6680",
  medium: "#1A9EA0",
  bright: "#30C8C0",
  soft: "#98E0D8",
  light: "#E6FFFC",
  white: "#FFFFFF",
  critical: "#E86F6F",
  attention: "#E2B149",
  positive: "#5ABB8E",
} as const;
