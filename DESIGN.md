---
name: PoliSocioLAB Reservas
description: Architectural live-availability workspace for the three laboratories of the Facultad de Ciencias Políticas y Sociología (UGR).
colors:
  faculty-orange: "#B84408"
  faculty-orange-deep: "#963605"
  faculty-orange-ink: "#A63C06"
  faculty-orange-soft: "#FFF1E8"
  faculty-orange-line: "#E8B598"
  capacity-teal: "#0E6A52"
  capacity-teal-ink: "#0B5542"
  capacity-teal-wash: "#E7F4EF"
  capacity-teal-line: "#9FD4C3"
  mineral-ground: "#F4F5F7"
  mineral-rail: "#EAECEF"
  sheet-white: "#FFFFFF"
  sheet-tint: "#F9FAFB"
  slate-ink: "#171B20"
  slate-muted: "#4C525C"
  hairline-rule: "#D4D8E0"
  hairline-soft: "#E5E8EE"
  field-stroke: "#646A75"
  amber-ink: "#7A4106"
  amber-wash: "#FEF4E2"
  amber-line: "#E7C58B"
  crimson-ink: "#9B1C1C"
  crimson-wash: "#FDECEC"
  crimson-line: "#E8B4B4"
typography:
  headline:
    fontFamily: "Schibsted Grotesk, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Schibsted Grotesk, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 750
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  subtitle:
    fontFamily: "Schibsted Grotesk, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Schibsted Grotesk, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0em"
  label:
    fontFamily: "Schibsted Grotesk, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0em"
rounded:
  cell: "2px"
  sm: "6px"
  md: "8px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.faculty-orange}"
    textColor: "{colors.sheet-white}"
    rounded: "{rounded.sm}"
    padding: "8px 15px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.faculty-orange-deep}"
    textColor: "{colors.sheet-white}"
  button-secondary:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.sm}"
    padding: "8px 15px"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.crimson-ink}"
    rounded: "{rounded.sm}"
    padding: "8px 15px"
    height: "44px"
  button-danger-solid:
    backgroundColor: "{colors.crimson-ink}"
    textColor: "{colors.sheet-white}"
    rounded: "{rounded.sm}"
    padding: "8px 15px"
    height: "44px"
  room-tab:
    backgroundColor: "{colors.sheet-tint}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.md}"
    padding: "15px 16px"
  room-tab-active:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.md}"
    padding: "15px 16px"
  day-button:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.sm}"
    padding: "9px 4px"
    height: "48px"
  day-button-current:
    backgroundColor: "{colors.slate-ink}"
    textColor: "{colors.sheet-white}"
    rounded: "{rounded.sm}"
    padding: "9px 4px"
    height: "48px"
  status-tag-available:
    backgroundColor: "{colors.capacity-teal-wash}"
    textColor: "{colors.capacity-teal-ink}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  status-tag-pending:
    backgroundColor: "{colors.amber-wash}"
    textColor: "{colors.amber-ink}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  input-field:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.sm}"
    padding: "9px 13px"
    height: "46px"
  sheet-card:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.md}"
    padding: "20px"
---

# Design System: PoliSocioLAB Reservas

## Overview

**Creative North Star: "Plano de Aulario"**

Plano de Aulario treats laboratory booking as a European university architectural schedule rather than a multi-step SaaS dashboard. The institutional burnt-orange header of the Facultad de Ciencias Políticas y Sociología (UGR) anchors every screen, holding the official Faculty emblem inside a crisp white plaque while keeping the operational surface calm, legible, and fast under campus daylight and mobile thumbs.

Beneath the header, authenticated users first choose which laboratory to book from a flat 3-column architectural space picker (Laboratorio de radio, Laboratorio cualitativo 1, and Laboratorio cualitativo 2). Entering a space opens a flush left mineral rail holding quick room switching, a return button to all spaces, and schematic floorplans, while the right-hand daylight canvas displays a 7-day week bar and a 1px-ruled hourly timetable from 08:00 to 21:00. Instead of generic floating cards, shadows, or decorative marketing copy, clarity comes from crisp hairline borders, tabular numerals, and a signature 10-segment occupancy meter that lets students and staff read room capacity in a single glance.

The system explicitly rejects generic SaaS chrome: no warm-beige AI backdrops, no nested cards inside cards, no colored left-accent stripes on rounded containers, and no drop shadows on resting surfaces.

**Key Characteristics:**
- Institutional burnt-orange sticky header anchoring the Faculty emblem and active `@go.ugr.es` session across all surfaces.
- Full-bleed two-column workspace on desktop (flush 320px mineral rail plus ruled white schedule sheet) collapsing to a 3-tab top switcher and touch-ready week strip on mobile.
- Zero resting shadows: hierarchy relies on cool mineral daylight layering (`#EAECEF` rail, `#F4F5F7` ground, `#FFFFFF` sheet) and crisp `1px` rules.
- Tabular-numeral timetable rows with a 10-segment architectural seat meter for Cualitativo 2 (`10` concurrent workstations) and a single-bar status track for full-room bookings.
- Native browser accessibility primitives throughout: `<dialog closedby="any">` modals, ARIA `tablist` keyboard navigation, `≥44px`/`48px` touch targets, and WCAG 2.1 AA contrast (`≥4.5:1`).

## Colors

A restrained daylight mineral palette paired with the Faculty's institutional orange for brand authority and an architectural teal exclusively for physical capacity availability.

### Primary
- **Faculty Orange** (`#B84408`): Sticky institutional header background, primary CTA buttons (`Solicitar`, `Acceder con @go.ugr.es`), active room-tab border/count badge, low-capacity alert segments (≤3 seats left), and keyboard focus rings. Passes WCAG AA (`≥4.5:1`) with white ink.
- **Faculty Orange Deep** (`#963605`): Hover state for primary buttons and subtle bottom hairline on the institutional header.
- **Faculty Orange Ink** (`#A63C06`): Text links, focused field labels, room icons, and high-attention KPI figures on white surfaces.
- **Faculty Orange Soft** (`#FFF1E8`): Text selection highlight and warm orange tint where subtle accent feedback is needed.
- **Faculty Orange Line** (`#E8B598`): Soft accent separator paired with Faculty Orange Soft.

### Secondary
- **Capacity Teal** (`#0E6A52`): Filled bars on the 10-seat occupancy meter and full-room availability tracks, plus valid form control borders. Reserved strictly for open physical capacity so availability reads instantaneously against neutral grays.
- **Capacity Teal Ink** (`#0B5542`): High-contrast availability counts (`10/10 libres`, `Libre`) and approval status tags.
- **Capacity Teal Wash** (`#E7F4EF`) & **Capacity Teal Line** (`#9FD4C3`): Fill and hairline border for success banners and approved status pills.

### Neutral
- **Mineral Ground** (`#F4F5F7`): Primary page canvas under the workspace, auth gate, and privacy sheet. Calibrated to cool daylight stone to avoid generic beige/cream tones and harmonize cleanly with the white Faculty emblem.
- **Mineral Rail** (`#EAECEF`): Flush left navigation rail, auth-gate directory panel, site footer, weekend day cells, and subtle neutral pills.
- **Sheet White** (`#FFFFFF`): Operational timetable sheet, admin lists, read-mode privacy sheet, modals, and active room tabs.
- **Sheet Tint** (`#F9FAFB`): Subtle hover/full-slot row tint and resting room-tab fill before selection.
- **Slate Ink** (`#171B20`): Primary body copy, headings, active selected date pill, and timetable hours.
- **Slate Muted** (`#4C525C`): Secondary metadata, capacity descriptions, weekend labels, and form hints (`≥7:1` on white).
- **Hairline Rule** (`#D4D8E0`) & **Hairline Soft** (`#E5E8EE`): `1px` outer container boundaries and internal timetable/list dividers.
- **Field Stroke** (`#646A75`): High-contrast `1px` border on text inputs, selects, and textareas (`≥5.4:1` against white).
- **Semantic Status Tokens**: **Amber** (`#7A4106` ink / `#FEF4E2` wash / `#E7C58B` line) for pending requests and demo banners; **Crimson** (`#9B1C1C` ink / `#FDECEC` wash / `#E8B4B4` line) for errors, rejections, and destructive confirmation controls.

### Named Rules
**The Faculty Header Rule.** Faculty Orange anchors the sticky top bar and primary actions, never sprawling across body backgrounds or competing with availability green.

**The Single-Meaning Teal Rule.** Capacity Teal appears exclusively for available room/seat capacity and confirmed valid/approved states—never as a decorative icon or secondary button fill.

## Typography

**Display Font:** `Schibsted Grotesk` (self-hosted variable WOFF2, weights 400–900, fallback `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`)
**Body Font:** `Schibsted Grotesk` (same unified grotesk family with tabular numerals)
**Label/Mono Font:** `Schibsted Grotesk` for UI labels; system monospace (`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`) strictly for inline technical identifiers (`code`).

**Character:** Crisp Nordic-European neo-grotesk engineered for digital legibility and signage; tight negative tracking on heavy headings pairs with open counters and aligned tabular figures (`font-variant-numeric: tabular-nums`) across timetables, dates, and seat counters.

### Hierarchy
- **Headline (`h1`)** (`800`, `2rem` / `32px` desktop, `1.5rem` / `24px` mobile, line-height `1.12`, tracking `-0.03em`): Active space title (`Laboratorio cualitativo 2`), auth gate headline, admin panel title, and privacy document title. Always one visible `<h1>` per active view.
- **Title (`h2`)** (`750`, `1.5rem` / `24px` desktop, `1.25rem` / `20px` mobile, line-height `1.2`, tracking `-0.025em`): Major section headers in modals, auth directory, admin tabs, and privacy headings.
- **Subtitle (`h3`)** (`700`, `1.125rem` / `18px`, line-height `1.3`, tracking `-0.01em`): Compact subsection headings and modal sub-blocks.
- **Body** (`400`, `1rem` / `16px`, line-height `1.55` in Operate views and `1.65` in Read mode): Standard prose, booking purposes, and descriptions. Long-form copy in `privacidad.html` caps at `58ch` for comfortable reading under 80 characters per line.
- **Label** (`700`, `0.875rem` / `14px`, line-height `1.3`, sentence case): Rail headings, form labels (`0.9375rem`), status pills (`0.8125rem`), and timetable summaries.

### Named Rules
**The Tabular Figures Rule.** Every hour range (`08:00 – 09:00`), date numeral, seat fraction (`6/10 libres`), KPI counter, and character counter sets `font-variant-numeric: tabular-nums` so columns never jitter on state updates.

**The Fixed Step Rule.** Heading sizes use fixed `rem` steps (`32px / 24px / 18px / 16px`, ≥1.25× jump per level) with `text-wrap: balance` on headings and `text-wrap: pretty` on paragraphs.

## Layout

Operate surfaces (`index.html` and `admin.html`) use a full-bleed two-column architectural shell below the full-width sticky orange header (`72px` min-height on desktop). The left rail is fixed at `20rem` (`320px`), flush to the viewport's left edge (`padding-inline-start` respects `env(safe-area-inset-left)`), separated from the main canvas by a single `1px` vertical hairline. The main operational column caps its inner content at `68rem` (`1088px`) with `1.25rem` (`20px`) vertical rhythm between the header bar, 7-day week strip, and ruled schedule sheet.

Below `960px`, the shell collapses to a single column: the left rail becomes a compact horizontal 3-column room switcher at the top while auxiliary schematic figures and text rules hide to prioritize immediate timetable visibility. Below `720px`, the header unsticks (`position: static`) to preserve vertical viewport height, the 7-day week bar becomes a horizontally scrollable `scroll-snap-type: x proximity` strip with `48px` minimum tap targets, and each timetable row shifts from a 4-column horizontal grid (`9.25rem | 1fr | 8.5rem | 7.5rem`) into a two-line compact grid (`time + action` on row 1, `meter + capacity` on row 2).

The Read surface (`privacidad.html`) centers a single white document sheet (`max-width: 52rem`) on the mineral ground with `58ch` paragraph measure.

## Elevation & Depth

Plano de Aulario is flat by default. Resting panels, sheets, rails, and list rows never cast drop shadows; separation is constructed purely through background value steps (`#EAECEF` rail -> `#F4F5F7` ground -> `#FFFFFF` sheet) and crisp `1px` borders (`#D4D8E0`). Elevation appears exclusively on top-layer native `<dialog>` modals to separate an interrupting confirmation or request form over a dimmed slate backdrop (`rgb(23 27 32 / 0.56)`).

### Shadow Vocabulary
- **Modal Overlay** (`box-shadow: 0 24px 48px -12px rgb(23 27 32 / 0.24)`): Applied exclusively to native `<dialog>` elements opened via `showModal()`.
- **Active Tab Ring** (`box-shadow: inset 0 0 0 1px #B84408`): Crisp 1px inset emphasis inside selected room/admin tabs to double border weight without causing layout shift.

### Named Rules
**The Flat-By-Default Rule.** Every resting surface on the canvas is strictly shadow-free. Only top-layer modals cast an exterior shadow.

## Shapes

Restrained architectural geometry with tight, functional radii: `6px` (`--radius-sm`) on interactive controls (buttons, day tiles, inputs, header emblem plaque), `8px` (`--radius-md`) on structural containers (schedule sheets, modals, banners, room tabs, auth gate), `2px` on individual 10-seat meter blocks so segments read like architectural desks, and `999px` pill geometry strictly on non-rectangular status tags, availability count badges, and circular user avatars.

Containers use uniform `1px` solid hairlines (`#D4D8E0`), switching to `1px dashed #BFC5D0` on closed weekend tiles to distinguish non-bookable days without relying on color alone. All SVG room schematics are framed as flat technical plan lines inside the same `8:3` container proportion.

## Components

### Buttons
Tactile, flat-bordered rectangular actions built for fast campus scanning and reliable thumb hits.
- **Shape:** Tight architectural corner (`6px` radius), minimum height `44px` (`2.75rem`), expanding to `48px` (`3rem`) on `@media (pointer: coarse)`.
- **Primary:** Faculty Orange fill (`#B84408`) with white ink (`#FFFFFF`), darkening to `#963605` on hover; `8px 15px` padding (`0.5rem 0.95rem`).
- **Hover / Focus:** `150ms ease` color/border transition; `3px solid #B84408` focus-visible ring with `2px` offset (white ring inside the orange topbar). Loading states set `aria-busy="true"` to reveal a compositor-only `transform: rotate(360deg)` spinner via `::before`.
- **Secondary / Danger / Danger-Solid:** Secondary uses white fill with `#D4D8E0` border and `#171B20` ink (darkening border to `#171B20` on hover); Danger outline uses crimson ink (`#9B1C1C`) and soft crimson border (`#E8B4B4`); Danger-Solid uses `#9B1C1C` fill with white ink inside destructive confirmation dialogs only.

### Chips
Compact status tags and room availability counts that communicate workflow state without loud color blocks.
- **Style:** Pill radius (`999px`), `1px` semantic border, `0.8125rem` (`13px`) bold text, `4px 10px` (`0.25rem 0.65rem`) padding, `white-space: nowrap`.
- **State:** Approved/Available uses Capacity Teal Wash + Ink; Pending/Queued uses Amber Wash + Ink; Rejected/Error uses Crimson Wash + Ink; Cancelled/Full uses Mineral Rail + Slate Muted. Active room-tab counters invert to Faculty Orange fill with white ink.

### Cards / Containers
Ruled architectural sheets rather than shadowed SaaS cards.
- **Corner Style:** Soft architectural corner (`8px` radius).
- **Background:** Sheet White (`#FFFFFF`) resting on Mineral Ground (`#F4F5F7`), with internal rows separated by `1px solid #E5E8EE`.
- **Shadow Strategy:** Zero shadow at rest (see Elevation & Depth).
- **Border:** `1px solid #D4D8E0` perimeter; never nested cards inside cards and never colored left-border strips.
- **Internal Padding:** `1.25rem` (`20px`) on form/list rows, `2.25rem` (`36px`) on auth gate and read sheets (`1.5rem 1.25rem` on mobile).

### Inputs / Fields
High-contrast, zoom-safe controls with clear focus ownership and non-intrusive validation.
- **Style:** `1px solid #646A75` stroke on `#FFFFFF` background, `6px` radius, `min-height: 2.85rem` (`46px`, `48px` on coarse pointers), `font-size: max(1rem, 1em)` to prevent iOS auto-zoom.
- **Focus:** `3px solid #B84408` `:focus-visible` outline (`2px` offset); parent `.field:focus-within > label` shifts label ink to `#A63C06`.
- **Error / Disabled:** Styled exclusively via `:user-invalid` (never raw `:invalid`) with crimson stroke (`#9B1C1C`), soft crimson tint (`#FDECEC`), and inline icon + text message; valid edited fields shift stroke to `#0E6A52`.

### Navigation
- **Header & Rail:** Sticky full-width Faculty Orange topbar (`72px` desktop) containing the framed official Faculty logo, `PoliSocioLAB` wordmark, and authenticated user avatar/logout button. Below, a vertical rail of 3 room buttons (`role="tab"` on admin, `aria-pressed` room switchers on portal) with active inset orange border (`inset 0 0 0 1px #B84408`), collapsing to a 3-column horizontal bar under `960px`.
- **Week Strip:** 7-day horizontal bar with `Previous` / `Next` arrow buttons (`44px+`), active date inverted to `#171B20` ink with white numerals, and closed Saturdays/Sundays marked with dashed borders and `#EAECEF` fill.

### Ten-Seat Occupancy Meter
The signature architectural component for `Laboratorio cualitativo 2` (10 concurrent seats), rendered both inside every hourly timetable row and in compact `6px`-tall form inside the left rail tab.
- **Geometry:** 10-column equal CSS Grid (`gap: 3px`, `max-width: 14rem` in rows, `100%` in compact rail mode) of crisp `8px`-tall (`6px` compact) `2px`-radius blocks.
- **Color Encoding:** Open seats render in Capacity Teal (`#0E6A52`) when ≥4 seats remain, shift to Faculty Orange (`#B84408`) when 1–3 seats remain (scarcity signal), and turn neutral slate (`#D8DCE4`) when occupied. Paired always with a right-aligned tabular numeric readout (`6 / 10 plazas`, `2 / 10 plazas`, `Sin plazas`) so color is never the sole carrier of meaning.

## Do's and Don'ts

### Do:
- **Do** keep the sticky Faculty Orange header (`#B84408`) with the white-framed official Faculty emblem (`logo-facultad.jpg`) as the institutional anchor across all pages.
- **Do** use tabular numerals (`font-variant-numeric: tabular-nums`) on every time slot, date tile, seat ratio, KPI card, and character counter.
- **Do** separate surfaces through tonal mineral steps (`#EAECEF` rail, `#F4F5F7` ground, `#FFFFFF` sheets) and `1px` hairlines (`#D4D8E0`) instead of shadows.
- **Do** enforce native `<dialog closedby="any">` modals with `autofocus` on the safe keep action for destructive actions (`#cancelDialog`, `#deleteBlockDialog`) and reset `dialog.returnValue = ''` on close.
- **Do** preserve `≥44px` interactive tap targets (`≥48px` on `@media (pointer: coarse)`) and `≥4.5:1` WCAG AA contrast on every text/control state.
- **Do** respect strict static CSP (`script-src 'self'`, `style-src 'self'`, `font-src 'self'`, `require-trusted-types-for 'script'`) using self-hosted `Schibsted Grotesk` WOFF2 fonts and zero inline styles or `innerHTML`.

### Don't:
- **Don't** introduce warm cream/beige backgrounds, floating marketing hero banners, or drop shadows on resting containers.
- **Don't** nest bordered cards inside other bordered cards or attach decorative colored left-border accent bars to rounded elements.
- **Don't** use Capacity Teal (`#0E6A52`) for decorative accents or non-capacity buttons; reserve it strictly for open availability and verified valid/approved states.
- **Don't** load external font CDNs, third-party JS CDNs, or raw `:invalid` error styling that flags untouched form inputs before user interaction.
- **Don't** trigger destructive deletions or cancellations immediately on click or via browser `window.prompt`/`window.confirm` popups.
