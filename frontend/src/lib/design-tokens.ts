/** Canvas renderers (Cytoscape) cannot resolve CSS variables. Keep these
 * literals aligned with the light theme in index.css; use CSS variables for
 * DOM/SVG surfaces whenever possible. */
export const IRIS_COLORS = {
  page: "#F7F9F9",
  surface: "#FFFFFF",
  tint: "#E7F1F2",
  ink: "#0A3A4A",
  ink2: "#4F6670",
  primary: "#0E6680",
  data: "#1A9EA0",
  mint: "#98E0D8",
  series2: "#7893A8",
  line: "#A9BAC0",
  critical: "#B65F59",
  attention: "#C98A1A",
  positive: "#3E8E66",
  white: "#FFFFFF",
} as const;
