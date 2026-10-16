# IRIS frontend — Phase 1 foundation

Implemented on `feat/iris-frontend-design`, 16 October 2026. Scope: shared visual
foundation, supplied assets, typography, and safe frontend verification. Phase 2
page composition has not started. No commits or pushes were made.

## Baseline

Before application edits: `npm test` passed 17 tests across three files;
`npm run typecheck` passed; `npm run build` passed. The production build already
warned about a minified JavaScript chunk larger than 500 kB. Initial sandboxed
Node commands failed with filesystem EPERM; checks succeeded outside the sandbox.
Initial Git status contained only the existing untracked `design-reference/`.

## Foundation and usage

The eight exact brand colors are available as Tailwind tokens:

| Token | Value |
|---|---|
| `brand-background` | `#04121C` |
| `brand-surface` | `#0A3A4A` |
| `brand-deep` | `#0E6680` |
| `brand-medium` | `#1A9EA0` |
| `brand-bright` | `#30C8C0` |
| `brand-soft` | `#98E0D8` |
| `brand-light` | `#E6FFFC` |
| `white` | `#FFFFFF` |

Red, yellow, and green are reserved for existing critical, attention, and positive
statuses. Informational states now use brand teal. Status foregrounds change for
light and dark contexts; text labels and non-color graph encodings are preserved.

`src/index.css` owns the Tailwind theme and base accessibility styles.
`src/styles/foundation.css` owns atmosphere, surfaces, and reusable tokens:

- `--iris-gradient-*`, `--iris-background`, `--iris-surface-*` for backgrounds.
- `--iris-glass-opacity` / `--iris-glass-blur` for glass treatment.
- `--iris-border*`, `--iris-shadow-*` for edges and internal reflections.
- `--iris-type-*` / `--iris-weight-*` for headings, subtitles, body, labels, metrics.
- `--iris-space-*` (4–48px), `--iris-radius-*` (10/16/24px).
- `--iris-hover-surface`, `--iris-focus-ring`, `--iris-transition` for controls.
- `--iris-chart-*` for dark/light chart series, axes, and grid.

Existing `Panel` callers require no changes. The new API supports:

```tsx
<Panel title="Evidence">Existing dark content</Panel>
<Panel variant="secondary" title="Context">Supporting content</Panel>
<Panel variant="metric" title="Reporting completeness">
  <p className="iris-type-metric">{formattedBackendValue}</p>
</Panel>
<Panel variant="hero" title="Workspace overview">Introductory content</Panel>
```

`dark` is the default. Metric and hero variants establish a light text/chart
context; dark/secondary variants explicitly restore a dark context when nested.
Hero imagery is decorative, blended beneath a light gradient. Page-specific use
of these variants is deferred to Phase 2.

Buttons retain the existing `primary`, `secondary`, `ghost`, `danger`, and `link`
API. Input/select/textarea semantics, labels, validation wiring, and disabled
attributes are unchanged. Native options have opaque readable backgrounds.

The dark atmosphere combines restrained brand gradients and 2.5% supplied grain.
Backdrop blur is progressive enhancement: opaque base surfaces remain available
without it. Reduced transparency and reduced motion preferences are supported.
Existing larger-text, stronger-focus, link-underline, and density preferences
remain available.

A documented CSS compatibility bridge adapts legacy `bg-white`, `bg-aqua-50`,
and dark-teal text utilities without editing feature layouts. White alpha classes
remain white for existing highlights. Replace legacy usage with explicit semantic
surface variants during subsequent feature work; do not extend this bridge as a
second independent design system.

## Typography and branding

`@fontsource/poppins` is pinned to 5.3.0 in the manifest and lockfile. Latin normal
weights 400/500/600/700 are served locally through Vite. Inter and IBM Plex Mono
dependencies and imports were removed. The legacy `font-mono` alias now also uses
Poppins; numeric tables retain tabular formatting. Graph canvas labels use Poppins.

Seven supplied assets were copied unchanged to `frontend/public/brand/`; source
and copy SHA-256 hashes match. `LogoMark` supports `updated`, `glossy`, `flat`, and
`vector`, with `object-contain` preserving proportions. The current sidebar/mobile
brand uses the updated artwork. The favicon uses the supplied vector.

Future access-screen composition can use the glossy mark on the left and the
flat/vector mark left-aligned inside the form. No access route, credential form,
divider, login/logout behavior, or production-security claim was added.

## Files changed or created

Paths below are relative to `frontend/` unless otherwise indicated.

| Files | Purpose |
|---|---|
| `package.json`, `package-lock.json` | Pin Poppins; remove unused fonts |
| `index.html` | Brand browser theme color |
| `src/main.tsx` | Local Poppins font imports |
| `src/index.css` | Brand theme, typography, accessibility |
| `src/styles/foundation.css` (new) | Atmosphere, glass surfaces, control styles, compatibility |
| `src/lib/design-tokens.ts` (new) | Matching palette for canvas renderers |
| `src/components/layout/AppShell.tsx`, `Sidebar.tsx`, `Logo.tsx` | Atmosphere and supplied branding |
| `src/components/ui/panel.tsx`, `button.tsx`, `badge.tsx`, `form.tsx` | Reusable surface/control variants |
| `src/components/data-display/PageHeader.tsx`, `charts.tsx` | Shared type hierarchy and surface-aware chart colors |
| `src/features/network/NetworkGraph.tsx`, `NetworkPage.tsx` | Canvas font/palette and matching legend colors only |
| `public/favicon.svg` | Supplied vector artwork |
| `public/brand/iris_logo_updated.png` (new) | Sidebar/mobile logo |
| `public/brand/iris_logo_glossy_original.png` (new) | Future access-screen brand |
| `public/brand/iris_logo_flat_transparent.png` (new) | Future access-form brand |
| `public/brand/iris_logo_vector.svg` (new) | Preserved vector variant |
| `public/brand/iris_micrograin.png`, `iris_mesh_wave.svg` (new) | Atmospheric assets; wave prepared for later composition |
| `public/brand/healthcare_analysts.webp` (new) | Hero surface imagery |
| `scripts/check-foundation.mjs` (new) | Safe browser smoke verification |
| `docs/IRIS_FRONTEND_PHASE1.md` (repository root, new) | This handoff |

## Verification and practical limits

Post-change tests: 17/17 passed; typecheck passed; production build passed. The
pre-existing chunk-size warning remains (largest output approximately 795 kB).
Font output now contains Poppins instead of Inter/IBM assets. npm reported zero
dependency vulnerabilities during installation; this is not a security audit.

Browser verification uses installed Edge because Playwright's bundled Chromium
is absent. The first run caught stale dev-server CSS, resolved by stylesheet
invalidation; subsequent checks verify loaded Poppins weights and computed fonts.

The safe script checks 43 route/viewport combinations across all four demo roles:
15 routes/views at 375 and 1600px, Home at 320/768/1024/1440px, and nine additional
admin/RHU/coordinator views at 375px. It checks headings, overflow, visible alerts,
console/page errors, HTTP failures, fonts, and image loading. It also checks mobile
navigation Escape/focus return, detection-dialog selection/cancellation, and
demo-role persistence/activation after reload. All seven brand assets decode successfully. Surface variants
were also rendered temporarily for visual inspection of text, fields, badges,
buttons, and reflections; those specimens do not add application routes or data.

Run against the existing development servers from `frontend/`:

```powershell
npm test
npm run typecheck
npm run build
$env:IRIS_BROWSER_CHANNEL = 'msedge'
node scripts/check-foundation.mjs http://localhost:5180 "$env:TEMP/iris-phase1-qa"
```

The browser script permits GET requests and planner comparison only. It blocks
reset and other workflow mutations. Existing backend GET/detail/candidate and
comparison operations may synchronize candidate actions; frontend work does not
alter that behavior. No reset, detection execution, import commit, or investigation
state change was performed. The existing `qa:e2e` script was not run because it
calls `/api/demo/reset`.

These checks establish rendering and selected control regressions, not complete
end-to-end workflow validation, formal WCAG certification, cross-browser coverage,
or production authentication readiness. Mutation workflows still need isolated
test data and a reset-free integration harness before broader release acceptance.

**Interaction finding:** selecting another demo role writes `iris.demoUser`, but
the visible session remains on the previous actor until reload. A separate browser
probe confirmed no new metadata request on selection, followed by an admin metadata
response after reload. The script reports this as a known limitation, rather than
counting immediate refresh as passed. `useSession.tsx`, `RoleSelector.tsx`, query
providers, and API client are unchanged from HEAD; this phase does not fix identity
or session logic. This interaction was not covered by the initial unit/build baseline.

No backend, database schema, algorithms, routes, query/client behavior,
permissions, session logic, or feature workflows were edited. The supplied
`design-reference/` files were preserved.

## Phase 2 recommendation

After approval, apply the shared variants to the overview, dataset registry, and
import flow first. Continue with network/evidence layouts and remaining workflows
in the approved sequence. Keep actual backend values and capability limits, retain
all working routes, and retire legacy styling gradually. Authentication and other
unsupported design capabilities remain separate scope decisions.
