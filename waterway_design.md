# Waterway Design System & Interface Specification (`waterway_design.md`)

> **Architectural Aesthetic**: *Nordic Maritime / Maritime Tech Minimal*  
> A high-density, calm, and purposeful design language inspired by Apple interface design and Scandinavian industrial consoles. It balances deep marine slate tones, seafoam teal accents, and warm off-white canvas surfaces with high legibility, micro-animations, and glassmorphism.

---

## 1. Core Philosophy & Design Identity

1. **High Contrast Anchor & Light Workspace**: A bold, solid dark-slate sidebar (`#112d3b`) provides navigational grounding and authority, while the workspace content sits on an airy, warm alabaster canvas (`#f7f8f5`).
2. **Restrained Color Coding**: Color is never purely decorative. It signals real system state:
   - **Seafoam Teal / Emerald**: Normal waterway operations, confirmed bookings, efficiency gains, environmental CO₂ avoidance.
   - **Warm Amber / Ochre**: Planning pool drafts, pending decisions, delay risks.
   - **Coral Crimson**: Disrupted vessels, active breakdowns, route closures.
   - **Marine Blue**: In-transit movement, active voyage tracking.
3. **Data Density with Breathing Room**: Information is structured in 12px/15px rounded cards with subtle 1px border lines (`#e2e9e2`) and soft shadows (`0 2px 5px rgba(32, 58, 52, 0.025)`).
4. **Direct Feedback & Tactile Motion**: Buttons lift `-1px` on hover with a smooth transition, modals enter with an ease-out translateY scale, and active states feature crisp inner shadow highlights.

---

## 2. Color Palette & Token System

### 2.1 Surfaces & Layout Backgrounds

| Token | Hex / Value | Description & Purpose |
|---|---|---|
| `--bg-canvas` | `#f7f8f5` | Main page background (soft warm oyster/cream, avoids harsh white glare) |
| `--surface-card` | `#ffffff` | Content cards, tables, modal bodies, input backgrounds |
| `--surface-subtle` | `#f3f8f4` | Nested comparison boxes, quote containers, table hover states |
| `--sidebar-dark` | `#112d3b` | Primary dark navigation bar (deep fjord slate) |
| `--sidebar-border` | `rgba(205, 235, 231, 0.1)` | Subtle divider line separating user profile from navigation |
| `--topbar-glass` | `rgba(247, 248, 245, 0.88)` | Sticky header with `backdrop-filter: blur(13px)` |
| `--overlay-scrim` | `rgba(17, 40, 44, 0.45)` | Modal backdrop blur scrim with `backdrop-filter: blur(5px)` |
| `--border-subtle` | `#e2e9e2` | Standard card border, row borders, divider lines |
| `--border-input` | `#dce6df` | Form input borders and inactive button outlines |

### 2.2 Brand & Maritime Accents

| Token | Hex / Value | Role |
|---|---|---|
| `--brand-teal` | `#53b9ad` | High-visibility seafoam mark, active dot indicator |
| `--brand-dark-teal` | `#277e7e` | Primary button background, emphasized brand icons |
| `--brand-teal-hover` | `#1f6b6d` | Primary button hover state |
| `--brand-petrol` | `#123540` | Cargo owner hero card, dark accent buttons |
| `--accent-amber` | `#ec8f5b` | Notification badge indicator, delay risk highlight |
| `--accent-gold` | `#f3b558` | Subdued secondary warm highlights |

### 2.3 Semantic Status Tones

All status chips and tags use soft-tinted background pills paired with high-contrast text and a small 5px status dot:

```css
/* Success (Active / In Transit / Confirmed / Delivered) */
color: #3f8d78;
background: #e8f6ee;

/* Warning (Pending / Awaiting Operator / Delay Risk) */
color: #a87945;
background: #fff3df;

/* Danger (Disrupted / Vessel Breakdown / Route Closed) */
color: #b76555;
background: #fff0ed;

/* Neutral (Draft / Idle / Baseline) */
color: #74837f;
background: #eef2ef;
```

### 2.4 Typography Color Scale

| Token | Hex | Usage |
|---|---|---|
| `--text-heading` | `#1c3035` | Main screen titles (`h1`, `h2`), high-contrast metrics |
| `--text-primary` | `#1b2730` | Body copy, table values, input text |
| `--text-secondary` | `#6d7f78` | Subtitles, field labels, table headers, descriptions |
| `--text-muted` | `#91a09b` | Timestamps, micro copy, metadata codes, footnotes |
| `--text-on-dark` | `#f1f7f5` | Text within sidebar, dark hero cards, and dark buttons |
| `--text-on-dark-dim` | `#83a4a8` | Sidebar category labels, subtitles on dark cards |

---

## 3. Typography & Text Hierarchy

### 3.1 Font Stack
```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```
For numerical tables, financial figures, metrics, and tons:
```css
font-variant-numeric: tabular-nums;
```

### 3.2 Type Scale Specifications

| Level | Size | Weight | Line Height | Letter Spacing | Example Usage |
|---|---|---|---|---|---|
| **Eyebrow / Kicker** | `10px` | 750 (Bold) | `1.0` | `+0.14em` | `LIVE NETWORK · UPDATED JUST NOW`, `WORKSPACE` |
| **Page Title (H1)** | `31px` | 650 (Semi-bold) | `1.12` | `-0.045em` | `Network command center`, `Your shipments` |
| **Section Title (H2)** | `17px` - `22px` | 680 (Bold) | `1.2` | `-0.025em` | Card titles, Modal headers (`Network flow`) |
| **KPI Numbers** | `25px` | 680 (Bold) | `1.0` | `-0.045em` | `₹8,940`, `27T`, `96.2%` |
| **Body Primary** | `12px` - `13px` | 400 (Regular) | `1.5` | `normal` | General descriptions, form text, table cells |
| **Micro / Meta** | `9px` - `10px` | 600 - 750 | `1.3` | `+0.05em` | Table column headers, timestamps, badges |

---

## 4. Layout Architecture & Component Positioning

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [SIDEBAR (Fixed, 238px)]     │ [TOPBAR (Sticky, Height: 70px, Blur: 13px)]             │
│                              │ Breadcrumbs  |  AI Copilot  |  Role Switcher  |  Bell   │
│ - Brand Mark (rotated -5°)   ├─────────────────────────────────────────────────────────┤
│ - Category Kicker            │ [PAGE CONTENT WRAPPER (max-width: 1460px, padding: 38px)]│
│ - Navigation Links (stacked) │                                                         │
│   (active state glow & line) │ Page Header: Title + Subtitle + Action Buttons          │
│                              │ ─────────────────────────────────────────────────────── │
│                              │ [METRICS ROW (4-Column Grid: 1fr 1fr 1fr 1fr)]          │
│                              │ ─────────────────────────────────────────────────────── │
│                              │ [MAIN SPLIT (1.45fr : 0.83fr)]                          │
│                              │ Digital Twin Network Map        │  Live Activity Stream │
│                              │ ─────────────────────────────────────────────────────── │
│                              │ [LOWER SPLIT (1fr : 1.06fr)]                            │
│                              │ Planning Pool List              │  Fleet Capacity Grid  │
│                              │ ─────────────────────────────────────────────────────── │
│ - User Profile Footer        │ Quick What-If Simulator Strip                           │
└──────────────────────────────┴─────────────────────────────────────────────────────────┘
```

### 4.1 Sidebar (`.sidebar`)
- **Position**: `position: fixed; inset: 0 auto 0 0; width: 238px; z-index: 5;`
- **Background**: `#112d3b`
- **Padding**: `27px 16px 18px`
- **Brand Logo Box**: `width: 34px; height: 34px; background: #53b9ad; color: #0e3b43; border-radius: 11px 11px 11px 4px; transform: rotate(-5deg);`
- **Nav Items**:
  - `padding: 11px 12px; border-radius: 9px; font-size: 13px; color: #a6c1c2;`
  - **Hover**: `background: rgba(131, 201, 193, 0.13); color: #fff;`
  - **Active**: `box-shadow: inset 2px 0 #6ed4c6; color: #fff; background: rgba(131, 201, 193, 0.13);`
- **Profile Strip**: Bottom pinned, border top `1px solid rgba(205, 235, 231, 0.1)`, circular 31px avatar (`background: #d9ece3; color: #1f5f62;`).
- **Responsive Behavior**: Below `720px`, collapses to `64px` icon-only dock.

### 4.2 Topbar (`.topbar`)
- **Position**: `position: sticky; top: 0; z-index: 4;`
- **Height**: `70px`
- **Padding**: `0 38px`
- **Background**: `rgba(247, 248, 245, 0.88)` with `backdrop-filter: blur(13px);`
- **Border**: `border-bottom: 1px solid #e3e8e3;`
- **Right Action Items**:
  1. **AI Copilot Button**: Seafoam pill (`background: #eaf5f2; color: #246d65; border: 1px solid #cce5dc`) with keyboard badge `⌘K`.
  2. **Role Switcher Dropdown**: White rounded pill (`border: 1px solid #dce5df; border-radius: 8px; padding: 7px 9px`) with Users icon.
  3. **Notification Bell**: 32px icon square with absolute-positioned circular badge (`#ec8f5b`).

### 4.3 Page Wrapper (`.page-wrap`)
- **Max Width**: `1460px`
- **Margins & Padding**: `padding: 38px 38px 56px; margin: auto;`
- **Heading Block**: Flex container with eyebrow tag (`LIVE NETWORK`), large title, subtitle, and primary right-hand action buttons.

---

## 5. Component Visual Specifications

### 5.1 Metric Cards (`.metric-card`)
- **Container**: `background: #fff; border: 1px solid #e2e9e2; border-radius: 12px; padding: 17px 19px; box-shadow: 0 2px 5px rgba(32, 58, 52, 0.025);`
- **Label**: `font-size: 11px; color: #80918d; font-weight: 600; text-transform: capitalize;`
- **Number**: `font-size: 25px; font-weight: 680; color: #1d3538; letter-spacing: -0.045em; margin: 7px 0 8px;`
- **Delta Indicator**:
  - Positive: `color: #3d9b83; font-size: 10px; font-weight: 700;`
  - Negative: `color: #a66a4b; font-size: 10px; font-weight: 700;`
  - Small comparison context: `color: #a0aca6; font-size: 10px;`

### 5.2 Digital Twin Network Map (`.network-map`)
- **Container**: Rounded inner canvas (`background: #f6faf7; height: 310px; border-radius: 9px; overflow: hidden; position: relative;`)
- **Background Blueprint Grid**: `linear-gradient(#dfece7 1px, transparent 1px)` repeating grid rotated `-7deg` with `opacity: 0.42`.
- **SVG Paths**:
  - Soft canal water corridor: `stroke: #c0d7d0; stroke-width: 9; stroke-linecap: round;`
  - Active voyage path: `stroke: #4db4a8; stroke-width: 3;`
  - Secondary path: `stroke: #89c9bc; stroke-width: 2.5;`
  - At-risk route: `stroke: #e4b16b; stroke-width: 2; stroke-dasharray: 5 7;`
- **Terminal Nodes**:
  - Inner point: `fill: #43ad9e; stroke: #fff; r: 8;`
  - Outer radar halo: `stroke: rgba(67, 138, 130, 0.18); stroke-width: 1; r: 15;`

### 5.3 Button System (`.button`)

```css
/* Base Style */
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 720;
  transition: transform .18s ease, background .18s ease, box-shadow .18s ease;
  cursor: pointer;
  white-space: nowrap;
}
.button:hover { transform: translateY(-1px); }

/* 1. Primary Action */
.button-primary {
  background: #277e7e;
  color: #ffffff;
  box-shadow: 0 5px 12px rgba(39, 126, 126, 0.15);
}
.button-primary:hover { background: #1f6b6d; }

/* 2. Secondary Outline */
.button-secondary {
  background: #ffffff;
  color: #3d6664;
  border-color: #d6e2db;
}
.button-secondary:hover { background: #edf5f0; }

/* 3. Ghost / Subtle */
.button-ghost {
  background: transparent;
  color: #3d6664;
  border-color: #d6e2db;
}
.button-ghost:hover { background: #edf5f0; }

/* 4. Dark Accent */
.button-dark {
  background: #153640;
  color: #ffffff;
}
```

### 5.4 Cargo Owner Hero Card (`.owner-hero`)
- **Background**: Deep ocean petrol `#123540`
- **Accents**: Concentric glowing radial rings rendered via pseudo-elements (`border: 1px solid rgba(128,210,194,0.2); border-radius: 50%; box-shadow: 0 0 0 32px ...`)
- **Stat Block**: Big 34px seafoam number (`#83d6c5`) showing average waterway savings (`18.4%`).

### 5.5 Proposal Route Diagrams
Used in Boat Operator views to depict cargo origins and destinations:
- **Terminal Dot**: 32px circle (`background: #e8f5f0; border: 1px solid #cbe6db; color: #2f7676; font-weight: 800; font-size: 9px`)
- **Connecting Line**: Flex spacer with centered route label (`color: #8c9d95; font-size: 9px;`) between two hairline teal borders.

### 5.6 Modal Sheets (`.overlay` & `.modal`)
- **Backdrop Overlay**: Fixed full-viewport with `background: rgba(17, 40, 44, 0.45); backdrop-filter: blur(5px); display: grid; place-items: center; z-index: 20;`
- **Modal Card**:
  - `width: min(680px, 100%);`
  - `background: #fbfcfa;`
  - `border-radius: 15px;`
  - `box-shadow: 0 22px 80px rgba(11, 35, 38, 0.24);`
  - Animation: `@keyframes modal-in { from { opacity: 0; transform: translateY(8px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }`
- **Modal Header**: Distinctive separator border with uppercase section kicker (`DRAFT PLAN`, `EXPLAINABILITY`, `AI COPILOT`).

---

## 6. Micro-Interactions & Animation Patterns

1. **Spring-Inspired Press**: Active elements compress slightly upon press:
   ```css
   button:active { transform: scale(0.97); }
   ```
2. **Subtle Elevation Hover**: Cards and action buttons elevate `-1px` to `-2px` with a softened box-shadow.
3. **Notification Drawer Slide-In**:
   ```css
   @keyframes drawer-in {
     from { opacity: 0; transform: translateY(-5px); }
     to   { opacity: 1; transform: translateY(0); }
   }
   ```
4. **Compare Track Transitions**:
   Waterway vs road comparative horizontal bars animate smoothly when parameters change (`transition: width 0.35s ease`).

---

## 7. Reusable CSS Starter Template (Copy-Paste Ready)

To replicate this exact design language in any new project, copy and adapt the stylesheet below:

```css
/* ==========================================================================
   WATERWAY DESIGN SYSTEM — CORE TOKENS & COMPONENTS
   ========================================================================== */

:root {
  --font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  
  /* Canvas & Cards */
  --bg-canvas: #f7f8f5;
  --bg-card: #ffffff;
  --bg-card-subtle: #f3f8f4;
  --border-card: #e2e9e2;
  --border-input: #dce6df;
  
  /* Brand Theme */
  --sidebar-bg: #112d3b;
  --sidebar-text: #f1f7f5;
  --sidebar-muted: #83a4a8;
  --teal-primary: #277e7e;
  --teal-primary-hover: #1f6b6d;
  --teal-accent: #53b9ad;
  --teal-pill-bg: #e8f5ef;
  
  /* Text */
  --text-main: #1b2730;
  --text-heading: #1c3035;
  --text-muted: #768581;
  
  /* Status */
  --status-success-bg: #e8f6ee;
  --status-success-text: #3f8d78;
  --status-warning-bg: #fff3df;
  --status-warning-text: #a87945;
  --status-danger-bg: #fff0ed;
  --status-danger-text: #b76555;
  
  /* Elevation */
  --shadow-card: 0 2px 5px rgba(32, 58, 52, 0.025);
  --shadow-modal: 0 22px 80px rgba(11, 35, 38, 0.24);
  --shadow-btn: 0 5px 12px rgba(39, 126, 126, 0.15);
}

/* Base resets */
body {
  margin: 0;
  font-family: var(--font-sans);
  background: var(--bg-canvas);
  color: var(--text-main);
  -webkit-font-smoothing: antialiased;
}

/* App Shell */
.app-shell {
  display: flex;
  min-height: 100vh;
}

/* Sidebar */
.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  width: 238px;
  background: var(--sidebar-bg);
  color: var(--sidebar-text);
  display: flex;
  flex-direction: column;
  padding: 27px 16px 18px;
  z-index: 5;
}

.brand-mark {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  background: var(--teal-accent);
  color: #0e3b43;
  border-radius: 11px 11px 11px 4px;
  transform: rotate(-5deg);
}

.sidebar nav {
  display: grid;
  gap: 4px;
  margin-top: 24px;
}

.nav-item {
  border: 0;
  background: transparent;
  color: #a6c1c2;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 9px;
  padding: 11px 12px;
  text-align: left;
  font-size: 13px;
  cursor: pointer;
  transition: 0.18s ease;
}

.nav-item:hover,
.nav-item.active {
  background: rgba(131, 201, 193, 0.13);
  color: #fff;
}

.nav-item.active {
  box-shadow: inset 2px 0 #6ed4c6;
}

/* Main Content Area */
.main-content {
  width: calc(100% - 238px);
  margin-left: 238px;
  min-height: 100vh;
}

/* Topbar */
.topbar {
  height: 70px;
  padding: 0 38px;
  border-bottom: 1px solid #e3e8e3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(247, 248, 245, 0.88);
  backdrop-filter: blur(13px);
  position: sticky;
  top: 0;
  z-index: 4;
}

/* Cards */
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: 12px;
  box-shadow: var(--shadow-card);
}

.card-header {
  padding: 19px 21px 13px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.section-kicker {
  font-size: 9px;
  font-weight: 750;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #84938f;
}

/* Metric Cards Grid */
.metric-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 14px;
}

.metric-card {
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: 12px;
  padding: 17px 19px;
  box-shadow: var(--shadow-card);
}

.metric-card strong {
  display: block;
  font-size: 25px;
  font-weight: 680;
  letter-spacing: -0.045em;
  color: var(--text-heading);
  font-variant-numeric: tabular-nums;
  margin: 7px 0 8px;
}

/* Buttons */
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 720;
  cursor: pointer;
  transition: transform 0.18s ease, background 0.18s ease;
}

.button:hover { transform: translateY(-1px); }
.button:active { transform: scale(0.97); }

.button-primary {
  background: var(--teal-primary);
  color: #ffffff;
  box-shadow: var(--shadow-btn);
}
.button-primary:hover { background: var(--teal-primary-hover); }

.button-secondary {
  background: #ffffff;
  color: #3d6664;
  border-color: #d6e2db;
}

/* Status Chips */
.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 7px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
}
.status-chip i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}
.status-chip.success { color: var(--status-success-text); background: var(--status-success-bg); }
.status-chip.warning { color: var(--status-warning-text); background: var(--status-warning-bg); }
.status-chip.danger  { color: var(--status-danger-text);  background: var(--status-danger-bg); }

/* Modals */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 40, 44, 0.45);
  backdrop-filter: blur(5px);
  display: grid;
  place-items: center;
  z-index: 20;
  padding: 20px;
}

.modal {
  width: min(680px, 100%);
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  background: #fbfcfa;
  border-radius: 15px;
  box-shadow: var(--shadow-modal);
}
```
