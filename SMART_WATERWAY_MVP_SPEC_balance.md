# Smart Waterway Logistics Planner — MVP System Design

> A cargo-first logistics platform for inland waterways. Cargo owners post what they need moved; boat operators list capacity; an optimization engine pools cargo, matches return loads, compares against road, explains its decisions, and re-plans when something breaks.
>
> **This document is the single source of truth for building the MVP.** It is written so it can be handed directly to a developer, or to another AI tool, to generate the backend, frontend and database. Where a number is a placeholder it is marked **[ASSUMPTION]** and lives in the `settings` table so it can be tuned without code changes.

---

## Table of contents

1. [Product summary and MVP scope](#1-product-summary-and-mvp-scope)
2. [Tech stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Roles: what each user does](#4-roles-what-each-user-does)
5. [Core workflows](#5-core-workflows)
6. [Database schema](#6-database-schema)
7. [Status state machines](#7-status-state-machines)
8. [Planner engine specification](#8-planner-engine-specification)
9. [REST API specification](#9-rest-api-specification)
10. [Notification system](#10-notification-system)
11. [Frontend specification and Apple-style design system](#11-frontend-specification-and-apple-style-design-system)
12. [Project structure](#12-project-structure)
13. [Seed data and demo script](#13-seed-data-and-demo-script)
14. [Build order](#14-build-order)
15. [Configuration, security and testing](#15-configuration-security-and-testing)
16. [Honest limitations and future work](#16-honest-limitations-and-future-work)

---

## 1. Product summary and MVP scope

### 1.1 The problem

Inland-waterway logistics is fragmented. Cargo owners do not know which boats are free. Operators do not know what cargo is waiting. Boats often return empty, run half-full, and have no way to coordinate with road legs at either end. Waterway freight therefore loses to road even where it could be cheaper and cleaner.

India's inland waterways authority already runs a listing portal (FOCAL) that connects cargo owners with vessel availability. This product is **not** another listing board. Its value is the layer on top: **planning**.

### 1.2 The one-sentence idea

> A cargo-first intelligent logistics engine that coordinates cargo, boats, terminals, road connections and routes to create the most cost-efficient, reliable and sustainable transportation network.

### 1.3 What the MVP must prove (the "demo-critical" features)

| # | Feature | Priority |
|---|---------|----------|
| 1 | Role-based login (cargo owner, boat operator, admin) | Must |
| 2 | Cargo posting and boat listing | Must |
| 3 | Instant quote: waterway plan vs road, with an honest "road is better" outcome | Must |
| 4 | Cargo pooling (bin-packing multiple jobs into one boat) | Must |
| 5 | Backhaul / round-trip matching | Must |
| 6 | **Optimize Network** button with before/after metrics | Must |
| 7 | Explainable recommendations ("Why B-104?") | Must |
| 8 | Notifications to cargo owner, operator and admin | Must |
| 9 | Disruption re-planning ("B-104 Unavailable") | Must |
| 10 | Admin dashboard (fleet, KPIs, live activity) | Must |
| 11 | Optimization modes (Lowest Cost / Lowest CO₂ / Fastest / Balanced) | Should |
| 12 | What-if simulator | Should |
| 13 | Predictive delay detection | Should |
| 14 | Network map with live status (the "digital twin" view) | Should |
| 15 | AI copilot (natural-language commands) | Could |

### 1.4 What is real vs simplified in the MVP

| Area | MVP approach |
|------|--------------|
| Optimization | Heuristic (greedy + first-fit-decreasing + local improvement) in plain Node.js. Deterministic and explainable. No external solver. |
| Distances | Seeded table of waterway edges between terminals. Road distance = straight-line × road factor. No external routing API. |
| Boat tracking | Simulated. Admin/operator buttons advance trips (`Departed`, `Arrived`, `Report delay`). No GPS. |
| Delay prediction | Rule-based risk score from schedule slack, not a trained ML model. |
| Payments | Out of scope. Prices are quotes only. |
| AI copilot | LLM only parses text into a structured command and summarizes the result. All numbers come from the engine. |
| Cargo splitting | A cargo job is never split across boats in the MVP. |
| Real-time | Server-Sent Events (SSE) for notifications, with polling fallback. |

---

## 2. Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | **Node.js 20+** | Requested |
| API | **Express 4** + `zod` validation | Requested; zod gives typed request validation |
| Auth | JWT (access token) + `bcrypt` | Simple, role claim in token |
| Database | **PostgreSQL 16** (local Docker, or Supabase/Neon free tier) | Relational integrity, `jsonb` for explanations and metrics, enums, arrays |
| DB access | **Prisma ORM** (schema derived from the SQL in §6) | Migrations, typed client, seed script |
| Realtime | **SSE** (`text/event-stream`) | One-way server push is all notifications need; far simpler than WebSockets |
| Scheduler | `setInterval` worker inside the API process (delay checks) | No queue infra needed for MVP |
| Frontend | **React 18 + Vite** | Requested |
| Styling | **Tailwind CSS 3.4** + CSS variables for the design tokens | Requested |
| Animation | **Motion** (`motion/react`, formerly Framer Motion) | Spring-based, interruptible, velocity-aware: required by the Apple-style design system |
| Routing / data | React Router 6, TanStack Query | Caching, refetch on notification |
| Map | `react-leaflet` + OpenStreetMap tiles | Free, no API key |
| Charts | Recharts | Before/after bars, utilization gauges |
| Icons | `lucide-react` | Consistent line icons |
| Tests | Vitest (planner unit tests), Supertest (API smoke tests) | Planner correctness is the product |
| Optional AI | Anthropic API, called **server-side only** | Copilot intent parsing |

> **SQLite fallback:** if Postgres is unavailable, the schema works on SQLite with these changes: `uuid` → `text`, `jsonb` → `json`/`text`, arrays → JSON text, enums → `text` with `CHECK`.

---

## 3. Architecture

```text
┌──────────────────────────── React + Vite + Tailwind ────────────────────────────┐
│  Owner app     │   Operator app    │   Admin console                              │
│  (post, quote, │   (boats, trips,  │   (dashboard, optimize, disruptions,         │
│   track)       │    accept/decline)│    simulator, map, copilot)                  │
│        ▲  Notification bell + toasts (SSE) ▲                                      │
└────────┼───────────────────────────────────┼──────────────────────────────────────┘
         │ REST (JSON, JWT)                  │ SSE /api/notifications/stream
┌────────▼───────────────────────────────────▼──────────────────────────────────────┐
│                               Express API (Node.js)                                │
│  auth │ cargo │ boats │ quotes │ plans │ trips │ disruptions │ simulator │ notif    │
│                                                                                    │
│  ┌──────────────────────────── Planner Engine (pure functions) ─────────────────┐ │
│  │ network.js  cost.js  co2.js  feasibility.js  pooling.js  backhaul.js         │ │
│  │ score.js    explain.js  replan.js  delay.js  simulate.js  baseline.js        │ │
│  └───────────────────────────────────────────────────────────────────────────────┘ │
│  Notification service │ Activity logger │ Delay watcher (setInterval)              │
└────────────────────────────────────────┬───────────────────────────────────────────┘
                                         │ Prisma
                              ┌──────────▼───────────┐
                              │     PostgreSQL        │
                              └───────────────────────┘
```

**Key architectural rule:** the Planner Engine is a set of **pure functions** (`input state → output plan`). They never touch the database or Express. Services load state from the DB, call the engine, then persist the result. This makes the what-if simulator trivial (run the same functions on a modified in-memory copy) and makes unit testing easy.

---

## 4. Roles: what each user does

### 4.1 Cargo Owner

Posts transportation needs and tracks them. Never needs to pick a boat, terminal or route.

| Can | Details |
|-----|---------|
| Register / log in | Name, organisation, phone, email |
| Post a cargo job | Cargo type, quantity (tonnes), pickup address + map pin, drop address + map pin, pickup window, delivery deadline, urgency |
| Get an instant quote | Waterway plan vs road comparison, price/tonne, CO₂, ETA, and an honest recommendation |
| Request booking | Accepts the quote; cargo enters the planning pool |
| Track a shipment | Timeline of road pickup → terminal → boat → terminal → road delivery, with ETA and status |
| See why | The explanation for the recommended boat/plan |
| Cancel a job | Only before the trip departs |
| Receive notifications | Matched, confirmed, declined, delay warning, re-planned, delivered |

| Cannot | |
|--------|-|
| See other owners' cargo, prices or boats' other bookings | Operators and owners see only their own data |

### 4.2 Boat Operator

Lists boats, states availability, and accepts or rejects trip proposals.

| Can | Details |
|-----|---------|
| Add / edit boats | Code (e.g. `B-104`), capacity, home terminal, supported cargo types, cost per km, fuel use, speed |
| Set availability windows | Available from, must return by, start terminal |
| See trip proposals | A proposed trip shows all cargo in it, route, times, utilization, expected revenue |
| **Accept / decline** a trip | Declining requires a reason; this triggers re-planning of that cargo |
| Update trip progress | Mark `Departed`, `Arrived at terminal`, `Report delay (minutes)` |
| Report a breakdown | Marks the boat unavailable and raises a disruption for the admin |
| Receive notifications | New booking request, trip cancelled by re-plan, delay acknowledgement |

| Cannot | |
|--------|-|
| See other operators' boats | Only the admin sees the whole fleet |
| Run network optimization or simulations | Admin only |

### 4.3 Admin

Monitors the entire network and owns optimization and disruption handling.

| Can | Details |
|-----|---------|
| See the whole network | Fleet status, all cargo, all trips, map with live status colours |
| **Run "Optimize Network"** | Choose a mode (Lowest Cost / Lowest CO₂ / Fastest / Balanced), review a draft plan, compare against the baseline, **publish** it |
| Handle disruptions | Click **"Boat Unavailable"**, review the generated recovery plan, **approve or reject** |
| Run the what-if simulator | Add/remove boats, change demand, close a route or terminal, change road cost |
| Use the AI copilot | Natural-language commands that map to the actions above |
| Manage master data | Terminals, waterway edges, cost/CO₂ parameters, optimization weights |
| Manage users | Activate/deactivate users, create demo accounts |
| Inject test events | Add delay minutes to a trip (for demos) |
| See the audit trail | Live activity feed driven by `activity_log` |
| Receive notifications | Disruptions, recovery plans awaiting approval, delay warnings, operator declines |

---

## 5. Core workflows

### 5.1 Post cargo → quote → request booking

```text
Owner posts cargo
      │
      ▼
API resolves nearest terminals (origin, destination) and road legs
      │
      ▼
Quote engine builds: best waterway option  vs  direct road option
      │
      ▼
Owner sees quote card:  "Waterway ₹X/T · Road ₹Y/T · Recommended: …  Why: …"
      │
Owner clicks "Request booking"  →  cargo.status = pending (in planning pool)
```

The quote at this stage is an **estimate** assuming the cargo is carried by the best available boat given current commitments. The final price is set when the network plan is published (pooling and backhaul usually lower it).

### 5.2 Optimize Network → publish → operator accepts → confirmed

```text
Admin picks mode → "Optimize Network"
      │
      ▼
Planner generates K candidate plans, scores them under the chosen mode
      │
      ▼
Draft plan + baseline comparison shown (before / after)
      │
Admin clicks "Publish plan"
      │
      ▼
Trips become `awaiting_operator`; cargo = `awaiting_operator`
Operators + owners notified
      │
Operator accepts  ──►  trip `confirmed`, cargo `confirmed`, owners notified
Operator declines ──►  cargo returned to pool, admin notified, auto re-plan suggestion
```

### 5.3 Disruption → recovery plan → approval

```text
Admin (or operator) marks B-104 unavailable
      │
      ▼
Engine finds affected trips + cargo, releases them
      │
      ▼
Re-plans only the affected cargo using spare capacity on other trips first, then new trips
      │
      ▼
Draft recovery plan: additional cost, penalty avoided, delay hours, reassignments
      │
Admin approves  ──►  plan published, owners + operators notified
```

### 5.4 Delay watcher (background)

Every 30 seconds the server recomputes ETAs for active trips. If a shipment's delay risk crosses the threshold (default 60%), it creates a `delay_warning` notification for the owner and admin, once per trip per hour, and attaches the best alternative if one exists.

---

## 6. Database schema

PostgreSQL 16. This SQL is the canonical schema; derive the Prisma schema from it (`prisma db pull`) or translate it by hand.

### 6.1 Entity overview

```text
users ──< boats ──< boat_availability
  │         │
  │         └──< plan_trips ──< trip_legs
  │                  │              │
  └──< cargo_jobs ───┴──< plan_assignments >── (leg_id)
          │                    │
          ├──< quotes          └── plans (draft / published / superseded)
          └──< bookings
terminals ──< waterway_edges
disruptions ──► plans (recovery plan)
users ──< notifications          activity_log          simulations          settings
```

### 6.2 Enums

```sql
CREATE TYPE user_role        AS ENUM ('cargo_owner','boat_operator','admin');
CREATE TYPE cargo_type       AS ENUM ('sand','cement','bricks','construction_material','grain','timber','other');
CREATE TYPE urgency_level    AS ENUM ('low','normal','high');
CREATE TYPE cargo_status     AS ENUM ('draft','pending','planned','awaiting_operator','confirmed',
                                      'in_transit','delivered','disrupted','cancelled');
CREATE TYPE boat_status      AS ENUM ('available','in_transit','unavailable','maintenance');
CREATE TYPE opt_mode         AS ENUM ('lowest_cost','lowest_co2','fastest','balanced');
CREATE TYPE plan_status      AS ENUM ('draft','published','superseded','rejected');
CREATE TYPE plan_trigger     AS ENUM ('manual_optimize','disruption','operator_decline','delay','simulation_applied');
CREATE TYPE trip_status      AS ENUM ('proposed','awaiting_operator','confirmed','declined',
                                      'in_transit','completed','cancelled');
CREATE TYPE booking_status   AS ENUM ('awaiting_operator','confirmed','in_transit','delivered','cancelled','replanned');
CREATE TYPE disruption_type  AS ENUM ('boat_unavailable','terminal_closed','route_closed','delay');
CREATE TYPE disruption_state AS ENUM ('active','resolved');
CREATE TYPE notif_severity   AS ENUM ('info','success','warning','critical');
CREATE TYPE trip_event_type  AS ENUM ('departed','arrived','delay_reported','breakdown');
```

### 6.3 Tables

```sql
-- ───────────── Identity ─────────────
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  email         text        NOT NULL UNIQUE,
  password_hash text        NOT NULL,
  role          user_role   NOT NULL,
  org_name      text,
  phone         text,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ───────────── Network master data ─────────────
CREATE TABLE terminals (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                     text    NOT NULL UNIQUE,           -- 'KOC', 'ALP', 'KLM', 'KTM'
  name                     text    NOT NULL,
  lat                      numeric(9,6) NOT NULL,
  lng                      numeric(9,6) NOT NULL,
  handling_cost_per_tonne  numeric(10,2) NOT NULL DEFAULT 30,  -- [ASSUMPTION] load/unload ₹ per tonne, charged at each terminal call
  turnaround_hours         numeric(4,2)  NOT NULL DEFAULT 1.0, -- fixed dwell per call
  is_active                boolean NOT NULL DEFAULT true
);

-- One row per DIRECTION. Seed both A→B and B→A.
CREATE TABLE waterway_edges (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_terminal_id uuid NOT NULL REFERENCES terminals(id),
  to_terminal_id   uuid NOT NULL REFERENCES terminals(id),
  distance_km      numeric(7,2) NOT NULL,
  is_open          boolean NOT NULL DEFAULT true,
  UNIQUE (from_terminal_id, to_terminal_id)
);

-- ───────────── Fleet ─────────────
CREATE TABLE boats (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 text NOT NULL UNIQUE,                  -- 'B-104'
  operator_id          uuid NOT NULL REFERENCES users(id),
  name                 text,
  capacity_tonnes      numeric(7,2) NOT NULL CHECK (capacity_tonnes > 0),
  home_terminal_id     uuid NOT NULL REFERENCES terminals(id),
  current_terminal_id  uuid NOT NULL REFERENCES terminals(id),
  supported_cargo      cargo_type[] NOT NULL,
  cost_per_km_loaded   numeric(10,2) NOT NULL,                -- ₹/km, includes crew + fuel
  empty_cost_factor    numeric(3,2)  NOT NULL DEFAULT 0.80,   -- empty running costs 80% of loaded
  fuel_l_per_km        numeric(6,2)  NOT NULL DEFAULT 0.35,   -- [ASSUMPTION] litres per km; drives CO₂ (~₹31/km of the cost_per_km)
  avg_speed_kmph       numeric(5,2)  NOT NULL DEFAULT 10,     -- [ASSUMPTION]
  max_range_km         numeric(7,2),
  status               boat_status NOT NULL DEFAULT 'available',
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE boat_availability (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id            uuid NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  start_terminal_id  uuid NOT NULL REFERENCES terminals(id),
  available_from     timestamptz NOT NULL,
  must_return_by     timestamptz NOT NULL,
  note               text,
  CHECK (must_return_by > available_from)
);

-- ───────────── Cargo ─────────────
CREATE TABLE cargo_jobs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference             text NOT NULL UNIQUE,                 -- 'CG-2026-0001'
  owner_id              uuid NOT NULL REFERENCES users(id),
  description           text,
  cargo_type            cargo_type NOT NULL,
  quantity_tonnes       numeric(7,2) NOT NULL CHECK (quantity_tonnes > 0),
  pickup_address        text NOT NULL,
  pickup_lat            numeric(9,6) NOT NULL,
  pickup_lng            numeric(9,6) NOT NULL,
  drop_address          text NOT NULL,
  drop_lat              numeric(9,6) NOT NULL,
  drop_lng              numeric(9,6) NOT NULL,
  origin_terminal_id    uuid REFERENCES terminals(id),        -- resolved by planner; owner may override
  dest_terminal_id      uuid REFERENCES terminals(id),
  pickup_from           timestamptz NOT NULL,
  pickup_to             timestamptz NOT NULL,
  deliver_by            timestamptz NOT NULL,
  urgency               urgency_level NOT NULL DEFAULT 'normal',
  late_penalty_amount   numeric(10,2) NOT NULL DEFAULT 0,     -- ₹ penalty if deadline missed (used for "penalty avoided")
  status                cargo_status NOT NULL DEFAULT 'draft',
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (pickup_to >= pickup_from AND deliver_by > pickup_from)
);

-- Incompatible pairs only. Absence of a row = compatible.
CREATE TABLE cargo_incompatibility (
  type_a cargo_type NOT NULL,
  type_b cargo_type NOT NULL,
  reason text,
  PRIMARY KEY (type_a, type_b)
);

-- Instant quote shown to the owner (estimate)
CREATE TABLE quotes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_id         uuid NOT NULL REFERENCES cargo_jobs(id) ON DELETE CASCADE,
  waterway_option  jsonb,     -- {pricePerTonne,total,etaAt,co2Kg,utilizationPct,legs[]}
  road_option      jsonb,     -- {pricePerTonne,total,etaAt,co2Kg,km}
  recommended      text NOT NULL CHECK (recommended IN ('waterway','road')),
  explanation      text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ───────────── Plans ─────────────
CREATE TABLE plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode             opt_mode    NOT NULL,
  status           plan_status NOT NULL DEFAULT 'draft',
  trigger          plan_trigger NOT NULL,
  parent_plan_id   uuid REFERENCES plans(id),
  created_by       uuid REFERENCES users(id),
  metrics          jsonb NOT NULL,   -- see §8.9
  baseline_metrics jsonb,            -- same shape, "traditional" approach
  alternatives     jsonb,            -- other modes' headline numbers for the comparison card
  created_at       timestamptz NOT NULL DEFAULT now(),
  published_at     timestamptz
);

CREATE TABLE plan_trips (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id            uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  boat_id            uuid NOT NULL REFERENCES boats(id),
  status             trip_status NOT NULL DEFAULT 'proposed',
  depart_at          timestamptz NOT NULL,
  est_end_at         timestamptz NOT NULL,
  total_cost         numeric(12,2) NOT NULL,
  total_co2_kg       numeric(10,2) NOT NULL,
  utilization_pct    numeric(5,2)  NOT NULL,
  empty_km           numeric(8,2)  NOT NULL DEFAULT 0,
  optimization_score numeric(5,2)  NOT NULL,
  explanation        jsonb,          -- {checks:[{label,ok}], summary, scoreBreakdown}
  decline_reason     text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE trip_legs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id           uuid NOT NULL REFERENCES plan_trips(id) ON DELETE CASCADE,
  seq               int  NOT NULL,
  from_terminal_id  uuid NOT NULL REFERENCES terminals(id),
  to_terminal_id    uuid NOT NULL REFERENCES terminals(id),
  depart_at         timestamptz NOT NULL,
  arrive_at         timestamptz NOT NULL,
  distance_km       numeric(7,2) NOT NULL,
  loaded_tonnes     numeric(7,2) NOT NULL DEFAULT 0,
  is_empty          boolean GENERATED ALWAYS AS (loaded_tonnes = 0) STORED,
  actual_depart_at  timestamptz,
  actual_arrive_at  timestamptz,
  UNIQUE (trip_id, seq)
);

-- One row = one cargo job placed on one leg of one trip, inside one plan version
CREATE TABLE plan_assignments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id             uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  trip_id             uuid NOT NULL REFERENCES plan_trips(id) ON DELETE CASCADE,
  leg_id              uuid NOT NULL REFERENCES trip_legs(id) ON DELETE CASCADE,
  cargo_id            uuid NOT NULL REFERENCES cargo_jobs(id),
  tonnes              numeric(7,2) NOT NULL,
  road_pickup_km      numeric(7,2) NOT NULL DEFAULT 0,
  road_drop_km        numeric(7,2) NOT NULL DEFAULT 0,
  price_total         numeric(12,2) NOT NULL,
  price_per_tonne     numeric(10,2) NOT NULL,
  road_price_per_tonne numeric(10,2) NOT NULL,    -- comparison figure
  co2_kg              numeric(10,2) NOT NULL,
  road_co2_kg         numeric(10,2) NOT NULL,
  eta_at              timestamptz NOT NULL,       -- delivery ETA at final destination
  delay_risk_pct      numeric(5,2) NOT NULL DEFAULT 0,
  reasons             jsonb,                      -- per-cargo explanation
  UNIQUE (plan_id, cargo_id)
);

-- Commercial record, created when a plan is published
CREATE TABLE bookings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_id         uuid NOT NULL REFERENCES cargo_jobs(id),
  assignment_id    uuid NOT NULL REFERENCES plan_assignments(id),
  trip_id          uuid NOT NULL REFERENCES plan_trips(id),
  status           booking_status NOT NULL DEFAULT 'awaiting_operator',
  price_total      numeric(12,2) NOT NULL,
  confirmed_at     timestamptz,
  delivered_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE trip_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid NOT NULL REFERENCES plan_trips(id) ON DELETE CASCADE,
  leg_id      uuid REFERENCES trip_legs(id),
  type        trip_event_type NOT NULL,
  minutes     int,                           -- for delay_reported
  note        text,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ───────────── Disruptions, simulation ─────────────
CREATE TABLE disruptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type               disruption_type NOT NULL,
  state              disruption_state NOT NULL DEFAULT 'active',
  boat_id            uuid REFERENCES boats(id),
  terminal_id        uuid REFERENCES terminals(id),
  edge_id            uuid REFERENCES waterway_edges(id),
  reported_by        uuid REFERENCES users(id),
  note               text,
  affected_cargo_ids uuid[] NOT NULL DEFAULT '{}',
  recovery_plan_id   uuid REFERENCES plans(id),
  additional_cost    numeric(12,2),
  penalty_avoided    numeric(12,2),
  created_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz
);

CREATE TABLE simulations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by     uuid NOT NULL REFERENCES users(id),
  name           text,
  scenario       jsonb NOT NULL,     -- see §8.8
  base_metrics   jsonb NOT NULL,
  result_metrics jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ───────────── Notifications, audit, config ─────────────
CREATE TABLE notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type              text NOT NULL,                 -- see §10.3
  severity          notif_severity NOT NULL DEFAULT 'info',
  title             text NOT NULL,
  message           text NOT NULL,
  why               text,                          -- optional explainability line
  related_cargo_id  uuid REFERENCES cargo_jobs(id),
  related_boat_id   uuid REFERENCES boats(id),
  related_trip_id   uuid REFERENCES plan_trips(id),
  related_plan_id   uuid REFERENCES plans(id),
  related_disruption_id uuid REFERENCES disruptions(id),
  action            jsonb,                         -- {type:'accept_trip', label:'Accept', tripId} or {type:'link', to:'/…'}
  dedupe_key        text,
  read_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user_unread ON notifications (user_id, read_at, created_at DESC);
CREATE UNIQUE INDEX idx_notif_dedupe ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE activity_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES users(id),
  event_type  text NOT NULL,                       -- 'cargo.posted', 'plan.published', 'boat.unavailable' …
  entity_type text,
  entity_id   uuid,
  summary     text NOT NULL,                       -- human-readable line for the live feed
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### 6.4 Recommended indexes

```sql
CREATE INDEX idx_cargo_status        ON cargo_jobs (status);
CREATE INDEX idx_cargo_owner         ON cargo_jobs (owner_id);
CREATE INDEX idx_boats_operator      ON boats (operator_id);
CREATE INDEX idx_trips_plan          ON plan_trips (plan_id);
CREATE INDEX idx_trips_boat_status   ON plan_trips (boat_id, status);
CREATE INDEX idx_assign_cargo        ON plan_assignments (cargo_id);
CREATE INDEX idx_activity_created    ON activity_log (created_at DESC);
```

### 6.5 Default `settings` rows (all **[ASSUMPTION]**: calibrate before any real pricing claim)

```jsonc
// key: 'cost'
{ "roadCostPerTonneKm": 6.0,      // [ASSUMPTION] ₹ per tonne-km, includes loading, tolls, driver
  "roadFactor": 1.3,              // road km ≈ straight-line km × 1.3
  "roadSpeedKmph": 30,
  "platformMarginPct": 8,
  "urgencySurchargePct": { "low": 0, "normal": 0, "high": 12 },
  "unloadBufferHours": 1.0 }

// key: 'co2'
{ "dieselKgCo2PerLitre": 2.68,    // standard diesel combustion factor
  "roadKgCo2PerTonneKm": 0.10,   // [ASSUMPTION] small/medium truck, part loads; make configurable
  "emptyFuelFactor": 0.80 }

// key: 'weights'   (sum ≈ 1; applied to metrics normalised against the baseline)
{ "lowest_cost": { "cost":0.70, "co2":0.05, "time":0.05, "lateRisk":0.10, "utilization":0.10 },
  "lowest_co2":  { "cost":0.10, "co2":0.60, "time":0.05, "lateRisk":0.10, "utilization":0.15 },
  "fastest":     { "cost":0.10, "co2":0.05, "time":0.60, "lateRisk":0.20, "utilization":0.05 },
  "balanced":    { "cost":0.30, "co2":0.20, "time":0.15, "lateRisk":0.20, "utilization":0.15 } }

// key: 'delay'
{ "warnThresholdPct": 60, "checkIntervalSec": 30, "dedupeMinutes": 60 }
```

---

## 7. Status state machines

### 7.1 Cargo

```text
draft ──(owner requests booking)──► pending ──(plan published)──► awaiting_operator
                                       ▲                                   │
                                       │ (operator declines / re-plan)     ├─(operator accepts)─► confirmed
                                       └───────────────────────────────────┘                         │
                                                                                          (trip departs)
confirmed ──► in_transit ──► delivered                                                                 
any pre-departure state ──(boat/terminal disruption)──► disrupted ──(recovery plan published)──► awaiting_operator
pending | awaiting_operator | confirmed ──(owner cancels)──► cancelled
```

### 7.2 Trip

```text
proposed ──(plan published)──► awaiting_operator ──(accept)──► confirmed ──(departed)──► in_transit ──(final arrival)──► completed
                                      └──(decline)──► declined
any non-completed ──(disruption / re-plan)──► cancelled
```

### 7.3 Plan

```text
draft ──(admin publishes)──► published ──(newer plan covers same cargo)──► superseded
draft ──(admin rejects)──► rejected
```

**Rules**
- Only **one published plan version** may own a given cargo job at a time.
- Publishing a recovery plan marks the affected trips of the parent plan `cancelled` and their bookings `replanned`.
- A trip that is `in_transit` cannot be cancelled by automatic re-planning. The engine flags it as **requires manual admin action**.

---

## 8. Planner engine specification

The engine lives in `server/src/engine/` as **pure, synchronous functions** with no database or HTTP access. Services load state, call the engine, persist the result.

### 8.1 Contracts

```ts
// Input (plain JSON; the simulator clones and edits this object)
type PlanInput = {
  now: string;                       // ISO timestamp, injected so tests are deterministic
  mode: 'lowest_cost'|'lowest_co2'|'fastest'|'balanced';
  terminals: Terminal[];
  edges: WaterwayEdge[];             // directed; only is_open=true edges are routable
  boats: Boat[];                     // with availability windows
  cargo: CargoJob[];                 // jobs to place (status pending / disrupted)
  frozenTrips?: Trip[];              // already-confirmed trips that must not move (used by re-planning)
  settings: { cost, co2, weights, delay };
  seed?: number;                     // for reproducible tie-breaking
};

// Output
type PlanOutput = {
  trips: Trip[];                     // each with legs[] and assignments[]
  unassigned: { cargoId: string; reasons: string[] }[];
  metrics: Metrics;                  // §8.9
  baselineMetrics: Metrics;          // §8.10
  alternatives: Record<Mode, { cost:number; co2Kg:number; lateRiskPct:number; score:number }>;
  explanations: Record<tripId, Explanation>;
};
```

**Engine modules**

| File | Responsibility |
|------|----------------|
| `network.js` | Shortest waterway path between terminals (Dijkstra over open edges), nearest-terminal lookup, haversine |
| `feasibility.js` | Time windows, capacity, compatibility, range, departure interval math |
| `cost.js` | Trip cost, per-cargo allocation, road comparison, pricing |
| `co2.js` | Boat and road emissions, allocation |
| `construct.js` | Pooling (first-fit-decreasing), backhaul attach, boat selection |
| `improve.js` | Local search (move / merge) |
| `score.js` | Plan objective, per-trip score breakdown |
| `explain.js` | Check lists, rejected-alternative reasons, summary sentence |
| `baseline.js` | "Traditional" comparison plan |
| `replan.js` | Disruption recovery |
| `delay.js` | ETA recompute and risk score |
| `simulate.js` | Scenario application + metrics diff |

### 8.2 Terminal resolution and road legs

For each cargo job:

1. `origin_terminal` = the owner's override if set, otherwise the terminal minimising `roadKm(pickup → terminal)`. Same for `dest_terminal` using the drop point.
2. `roadKm(a, b) = haversine(a, b) × settings.cost.roadFactor`.
3. `road_pickup_km` and `road_drop_km` are the road legs to and from the terminals. If a leg is under 1 km, treat it as zero.
4. **Direct road alternative:** `roadDirectKm = haversine(pickup, drop) × roadFactor`.
5. If `origin_terminal == dest_terminal`, the cargo is not waterway-eligible → recommend road.
6. If no open waterway path exists between the two terminals → recommend road and say why.

Optional improvement: evaluate the 2 nearest terminals at each end and choose the combination with the lowest door-to-door cost. Do this only after the basic version works.

### 8.3 Time model and feasibility

All times in UTC in the engine; the UI renders in `Asia/Kolkata`.

```text
roadPickupHrs  = road_pickup_km / roadSpeedKmph
roadDropHrs    = road_drop_km   / roadSpeedKmph
readyAtTerminal(c)  = c.pickup_from + roadPickupHrs
legHours(edge, boat)= edge.distance_km / boat.avg_speed_kmph
```

For a trip with outbound cargo set `S` on route `O → D` by boat `b`:

```text
repositionHrs   = waterwayHours(b.current_terminal → O)       // 0 if already at O
earliestDepart  = max( b.available_from + repositionHrs,
                       max over c in S of readyAtTerminal(c) )
latestDepart(c) = c.deliver_by − unloadBufferHours − roadDropHrs
                  − legHours(O→D, b) − D.turnaround_hours*0 (arrival is the delivery event)
feasibleWindow  = [ earliestDepart , min over c in S of latestDepart(c) ]
```

The set `S` is feasible only if `earliestDepart ≤ latestDepart_min`. Choose `departAt = earliestDepart`.

**Return (backhaul) leg**

```text
arriveD   = departAt + legHours(O→D)
departBack= arriveD + D.turnaround_hours        (or later if return cargo is not ready yet; wait is allowed up to a limit)
arriveO   = departBack + legHours(D→O)
Return cargo r is feasible iff:
  readyAtTerminal(r) ≤ departBack + maxWaitHours        (maxWaitHours default 2)
  arriveO + unloadBufferHours + roadDropHrs(r) ≤ r.deliver_by
  arriveO ≤ b.must_return_by
```

**Hard constraints** (a candidate violating any is rejected, with the reason recorded for explainability):

1. `Σ tonnes on a leg ≤ boat.capacity_tonnes`
2. Boat supports every cargo type on board
3. No pair of cargo types on the same boat appears in `cargo_incompatibility`
4. The departure window above is non-empty
5. The boat returns by `must_return_by`
6. Total trip distance ≤ `max_range_km` (if set)
7. Every edge on the path is open and every terminal on it is active
8. A boat has no overlapping trips

**Soft constraints** go into the score: slack to deadline, empty kilometres, repositioning distance.

### 8.4 Cost model and pricing

```text
legCost(leg)   = leg.distance_km × boat.cost_per_km_loaded × (leg.is_empty ? boat.empty_cost_factor : 1)
tripWaterCost  = Σ legCost over all legs, including repositioning and the empty return
                 (so a trip with no backhaul carries the cost of the empty return)

cargoShare(c)  = (c.tonnes × distanceOfLegCarriedOn(c)) / Σ over all cargo on the trip (tonnes × leg distance)

waterCost(c)   = tripWaterCost × cargoShare(c)
handling(c)    = c.tonnes × (origin.handling_cost_per_tonne + dest.handling_cost_per_tonne)
roadLegs(c)    = settings.cost.roadCostPerTonneKm × c.tonnes × (road_pickup_km + road_drop_km)

subtotal(c)    = waterCost + handling + roadLegs
price_total(c) = subtotal × (1 + platformMarginPct/100) × (1 + urgencySurcharge(c.urgency)/100)
price_per_tonne= price_total / c.tonnes

roadOption(c)  = roadCostPerTonneKm × c.tonnes × roadDirectKm          // market benchmark, no margin
```

**Why this makes backhaul visible in the price:** adding a return cargo adds tonne-kilometres to the denominator, so every cargo on the trip carries a smaller share of the same trip cost. The explanation text must say exactly that.

**Recommendation logic (quote and plan):**

```text
saving% = (roadOption.total − waterwayOption.total) / roadOption.total × 100
if not waterway-eligible        → "road", reason = eligibility message
elif saving% ≥ +3               → "waterway", "Waterway is {saving}% cheaper"
elif saving% ≤ −3               → "road", e.g. "Road is currently the better option because
                                   the nearest terminal adds {extraKm} km of road travel"
else                            → "waterway" if co2 saving ≥ 25% else "road"   (tie-break, say so)
```

If the deadline cannot be met by water but can by road, recommend road and say "deadline".

**Worked example with the seed numbers (illustrative; recompute with the engine, never hardcode):**
Kochi → Alappuzha is 55 km of waterway. B-104 costs ₹45/km loaded (₹36/km empty). Handling is ₹30/T per terminal call (₹60/T total). Margin 8%. Road is ₹6 per tonne-km (the `settings.cost.roadCostPerTonneKm` default) over a 60 km road distance.

| Scenario | Trip water cost | Sand 10T price/T | Road price/T | Outcome |
|----------|-----------------|------------------|--------------|---------|
| 10T alone, empty return | 55×45 + 55×36 = ₹4,455 | (4,455 + 600) × 1.08 / 10 ≈ **₹546** | ₹360 | **Road better** |
| 10T + 6T + 4T pooled, 7T backhaul | 55×45 ×2 = ₹4,950, shared by tonne-km (20T out + 7T back) | ≈ **₹263** | ₹360 | **Waterway ≈ 27% cheaper** |

This is the product's core story: a single cargo alone is not competitive with road, and pooling plus backhaul makes it competitive. Keep this behaviour; it is what makes the platform's recommendations credible.

### 8.5 CO₂ model

```text
boatCo2(trip)   = Σ over legs ( distance_km × boat.fuel_l_per_km × (leg.is_empty ? settings.co2.emptyFuelFactor : 1) )
                  × dieselKgCo2PerLitre
cargoBoatCo2(c) = boatCo2(trip) × cargoShare(c)               // same share as cost
cargoRoadLegsCo2(c) = roadKgCo2PerTonneKm × c.tonnes × (road_pickup_km + road_drop_km)
cargoCo2(c)     = cargoBoatCo2 + cargoRoadLegsCo2
roadCo2(c)      = roadKgCo2PerTonneKm × c.tonnes × roadDirectKm
co2Avoided(c)   = roadCo2(c) − cargoCo2(c)                    // can be negative; show honestly
```

Empty running is penalised through the fuel term, so avoiding empty returns shows up directly in CO₂. Show negative savings in red; do not clip to zero.

### 8.6 Plan construction (pooling + backhaul)

The MVP uses a **construct → improve → score** heuristic, run for several orderings, then picks the best.

```text
function plan(input):
  resolve terminals + road legs for every cargo; mark ineligible cargo as road-only
  candidates = []
  for ordering in [byDeadline, byWeightDesc, byUrgencyThenDeadline, byRouteCluster, seededShuffle×5]:
      p = construct(input, ordering)
      p = improve(p, input)           // §8.6.3
      candidates.push(p)
  for each mode m: best[m] = argmin over candidates of objective(p, m)         // §8.7
  chosen = best[input.mode]
  return chosen + alternatives = headline numbers of best[m] for every m
```

#### 8.6.1 `construct(input, ordering)`

```text
groups = group eligible cargo by (origin_terminal, dest_terminal)       // a "direction"
sort groups by total tonnage desc
boatsFree = boats usable now (status available, not disrupted, has availability window)

for each group G (in order):
    queue = sort(G.cargo, ordering)
    while queue not empty:
        best = null
        for each boat b in boatsFree that supports at least one cargo in queue:
            load = packFFD(queue, b)                         // §8.6.2
            if load.empty: record reason "capacity/time/compat" for b; continue
            trip = buildTrip(b, G.direction, load)           // adds reposition leg if needed
            trip = attachBackhaul(trip, input)               // §8.6.4
            trip.tripObjective = tripCostPerTonne(trip)      // lower is better, tie-break: higher utilization
            best = better(best, trip)
        if best == null: mark remaining queue cargo unassigned with collected reasons; break
        commit(best); remove its cargo from queue; remove its boat from boatsFree for the overlapping window
```

#### 8.6.2 `packFFD(queue, boat)` — cargo pooling

First-fit-decreasing bin packing with time and compatibility checks.

```text
sorted = queue sorted by tonnes desc (ties: earlier deadline first)
load = []
for c in sorted:
    if capacityRemaining(load, boat) < c.tonnes:         continue
    if not boat.supports(c.type):                         continue
    if incompatibleWith(load, c):                         continue
    if not departureWindowNonEmpty(load + [c], boat):     continue
    load.push(c)
return load
```

**Utilization-aware tweak:** after FFD, try replacing the smallest cargo in the load with a larger waiting cargo that still fits, if that raises tonnes carried without breaking constraints. One pass is enough.

#### 8.6.3 `improve(plan)` — local search (max 200 iterations, stop on no improvement)

| Move | Description | Accept if |
|------|-------------|-----------|
| **Relocate** | Move one cargo from trip A to trip B (same direction, capacity free, time feasible) | Plan objective decreases |
| **Merge** | If two trips on the same direction both have utilization < 50% and combined tonnes fit one boat, merge into the larger boat's trip and free the other boat | Objective decreases |
| **Backhaul upgrade** | For a trip returning empty, try attaching any unassigned reverse cargo | Objective decreases |

#### 8.6.4 `attachBackhaul(trip)` — round-trip matching

```text
candidates = unassigned cargo where origin_terminal == trip.dest and dest_terminal == trip.origin
filter by: return feasibility (§8.3), capacity ≤ boat.capacity, boat supports type, compat
pick the subset maximising tonnes carried using packFFD on candidates
if chosen set non-empty: add return leg with loaded_tonnes = Σ tonnes, mark trip.hasBackhaul = true
else: add an EMPTY return leg (is_empty = true) so its cost and CO₂ are counted honestly
```

Record `emptyKmAvoided = returnLegKm` when backhaul is attached; this feeds the "420 km of empty travel avoided" KPI (it is the sum across all trips).

### 8.7 Scoring, optimization modes and explainability

#### 8.7.1 Plan objective (used to choose between candidate plans)

```text
norm_cost       = plan.totalCost            / baseline.totalCost
norm_co2        = plan.totalCo2Kg           / baseline.totalCo2Kg
norm_time       = plan.avgDeliveryHours     / baseline.avgDeliveryHours
norm_lateRisk   = (plan.avgLateRiskPct + 5) / (baseline.avgLateRiskPct + 5)     // +5 avoids divide-by-zero
norm_util       = (1 − plan.utilization)    / (1 − baseline.utilization)
unassignedPenalty = 1.0 × (unassignedCargo / totalCargo)

J(plan, mode) = w_cost·norm_cost + w_co2·norm_co2 + w_time·norm_time
              + w_lateRisk·norm_lateRisk + w_util·norm_util + unassignedPenalty
planScore     = clamp(50 + (1 − J) × 100, 0, 100)        // baseline ≈ 50, perfect ≈ 100
```

`w_*` come from `settings.weights[mode]`. Lower `J` is better. The baseline plan has `J ≈ 1` (minus the penalty) by construction.

#### 8.7.2 Per-trip optimization score (the "94 / 100" in the UI)

| Component | Max pts | Formula |
|-----------|---------|---------|
| Utilization | 30 | `30 × trip.utilization` |
| Empty return avoided | 25 | `25 × (1 − emptyKm / totalKm)` |
| Cost advantage vs road | 20 | `20 × clamp(avgSaving% / 25, 0, 1)` |
| Proximity to pickup | 10 | `10 × (1 − clamp(repositionKm / 100, 0, 1))` |
| Deadline slack | 10 | `10 × clamp(minSlackHours / 6, 0, 1)` |
| CO₂ advantage vs road | 5 | `5 × clamp(avgCo2Saving% / 40, 0, 1)` |

Store the breakdown in `plan_trips.explanation.scoreBreakdown` so the UI can draw it.

#### 8.7.3 Explanation object

```jsonc
{
  "summary": "B-104 was selected because it can carry the outbound cargo within the required delivery window and has a compatible 7T return shipment, reducing estimated empty travel by 110 km.",
  "checks": [
    { "label": "Already at Kochi terminal (0 km to pickup)", "ok": true },
    { "label": "20T capacity fits 20T load", "ok": true },
    { "label": "Available during pickup window", "ok": true },
    { "label": "Cargo types compatible", "ok": true },
    { "label": "7T return cargo matched", "ok": true },
    { "label": "Lowest cost per tonne of 3 feasible boats", "ok": true },
    { "label": "Avoids 110 km of empty travel", "ok": true }
  ],
  "rejected": [
    { "boat": "B-109", "reason": "10T capacity is less than the 16T needed" },
    { "boat": "B-107", "reason": "₹412/T vs ₹263/T for B-104" }
  ],
  "scoreBreakdown": { "utilization": 20.3, "emptyAvoided": 25, "costAdvantage": 9.6, "proximity": 10, "slack": 7.5, "co2": 2.1, "total": 74.5 }
}
```

Always generate the **rejected** list from the real reasons collected during construction. This is what makes the explanation trustworthy and not decorative.

### 8.8 What-if simulation

`simulate(baseInput, scenario)` deep-clones `baseInput`, applies the scenario, runs `plan()` with the same mode, and returns `{ base: Metrics, result: Metrics, diff }`. **It never writes to the database** unless the admin clicks "Apply as plan" (which creates a `draft` plan with trigger `simulation_applied`).

```jsonc
// scenario examples (stored in simulations.scenario)
{ "type": "add_boats",       "count": 3, "template": { "capacity_tonnes": 15, "home_terminal": "KOC" } }
{ "type": "remove_boat",     "boatCode": "B-104" }
{ "type": "demand_change",   "percent": 30, "routes": ["KOC->ALP"] }      // routes optional = all
{ "type": "close_edge",      "from": "KOC", "to": "ALP" }                  // both directions
{ "type": "disable_terminal","code": "KTM" }
{ "type": "road_cost_change","percent": -20 }
{ "type": "combo",           "steps": [ { "type": "...", ... }, { "type": "..." } ] }
```

**Demand change:** deterministically (seeded) duplicate existing cargo jobs with jittered quantities and windows until total tonnes ≈ `base × (1 + percent/100)`. Never read random numbers without a seed; the same scenario must always give the same answer.

**Capacity analysis (for "what if demand +30%?")**

```text
dailyCapacityT  = Σ over boats ( capacity × feasibleRoundTripsPerDay(route) )
projectedDemand = currentDemandT × (1 + percent/100)
bottleneck      = route with the highest unassignedTonnes / capacityOnRoute
recommendation  = smallest of: addBoats(n) | addRoundTrip(k) that clears the bottleneck in a re-run
```

Return both the recommendation and the evidence (re-run metrics with the recommendation applied).

### 8.9 Metrics object (same shape everywhere)

```jsonc
{
  "cargoMovedT": 27,
  "cargoCount": 4,
  "unassignedCount": 0,
  "tripCount": 1,
  "totalCost": 9560,                 // ₹ operating cost of all trips + handling + road legs
  "totalRevenue": 10325,             // sum of cargo price_total
  "avgCostPerTonne": 354,
  "totalCo2Kg": 810,
  "roadEquivalentCo2Kg": 1240,       // same cargo, direct road
  "co2AvoidedKg": 430,
  "utilizationPct": 67.5,            // Σ(tonnes×km) / Σ(capacity×km), counting empty legs
  "emptyTrips": 0,                   // trips with an empty leg
  "emptyKm": 0,
  "emptyKmAvoided": 55,
  "avgDeliveryHours": 31.2,
  "lateDeliveries": 0,
  "avgLateRiskPct": 6.0,
  "fleet": { "available": 2, "inTransit": 1, "unavailable": 0 }
}
```

### 8.10 Baseline ("Traditional approach")

Used for every before/after comparison. Same cargo, same boats, **no** pooling, **no** backhaul, **no** network view:

```text
for each cargo in posting order:
    pick the nearest free boat (by reposition distance) with enough capacity and a feasible window
    if none → unassigned
    create a single-cargo trip with an EMPTY return leg
```

Compute `Metrics` for it exactly as for the optimized plan. The UI shows both columns. If the baseline is accidentally flattering to the optimizer, judges will notice, so keep it a reasonable "first boat that fits" policy and say so in a tooltip.

### 8.11 Disruption re-planning

```text
replanForDisruption(state, disruption):
  1. Mark the disrupted boat/terminal/edge unavailable in a cloned input.
  2. affectedTrips = trips (status proposed|awaiting_operator|confirmed, not yet departed) that use it.
     In-transit trips are NOT touched; flag "requires manual action".
  3. affectedCargo = all cargo on those trips.
  4. frozen = every other confirmed/in-transit trip stays exactly as is.
  5. FIRST try insertion: for each affected cargo, test spare capacity on frozen trips on the same direction
     (feasibility §8.3 with the trip's existing times). Insert if feasible, cheapest first.
  6. THEN run plan() on the remaining affected cargo with boats = idle boats + boats with spare windows.
  7. Compare:
       additionalCost  = newCost(affectedCargo) − oldCost(affectedCargo)
       penaltyAvoided  = Σ cargo.late_penalty_amount  for cargo that would have missed the deadline
                         if left unplanned, otherwise 0
       delayHours      = Σ max(0, newETA − originalETA)
  8. Return a DRAFT recovery plan (trigger 'disruption', parent = current plan) + the numbers above.
  9. Cargo that cannot be re-placed → listed in unassigned with reasons; the UI shows a clear
     "needs attention" state and offers options (relax window, road fallback, add boat).
```

The engine must **re-optimize the affected sub-network** (steps 5-6), not simply swap in the nearest boat.

### 8.12 Delay risk and prediction

```text
ETA(cargo)      = legs' planned arrive_at + Σ reported delay minutes on this and earlier legs + roadDropHrs + unloadBuffer
slackHours      = deliver_by − ETA(cargo)
requiredBuffer  = 0.10 × transitHours + 0.5 × (1 if terminal call) + 0.5 × (number of road legs)
risk%           = 100 / (1 + exp( −(requiredBuffer − slackHours) / 1.5 ))
```

Calibration check: ETA 5:40 PM vs deadline 4:00 PM gives slack ≈ −1.7 h, requiredBuffer ≈ 1 h, risk ≈ 86%. If `risk% ≥ settings.delay.warnThresholdPct`, create a `delay.warning` notification (deduped) and compute alternatives with `replanForDisruption` of type `delay`.

Possible stated causes, picked from whichever term dominates: *boat already running late*, *tight road-water connection*, *terminal turnaround*, *previous booking running late*, *insufficient turnaround time*. Label this "rule-based risk estimate", not a prediction from a trained model.

### 8.13 AI copilot (optional)

The LLM is a **translator**, never the decision-maker.

```text
POST /api/copilot { message }
  1. Server sends message + a strict system prompt to the LLM asking for ONLY JSON:
       { "intent": "replan_disruption|simulate|optimize|status|explain",
         "params": { ... } }
  2. Server validates with zod against an allow-list. Anything else → "I can't do that".
  3. Server calls the engine function for that intent. Result is a draft/preview ONLY.
  4. Server returns { intent, params, result, summary } where summary is generated from the result
     (template, or LLM with the result JSON as context and an instruction to quote numbers verbatim).
  5. Applying anything still requires the admin to press the explicit button.
```

- Use the server-side env var `ANTHROPIC_API_KEY`; never expose it to the browser. Set the model via `ANTHROPIC_MODEL`.
- **Fallback for demo reliability:** a regex/keyword parser for the 5 demo phrases ("B-104 broke down…", "what if demand increases by 30%", "add 3 boats", "optimize for lowest CO2", "why B-104"). The copilot must still work with no internet.
- Treat user text and any database text as untrusted input. The allow-list validation is the defence against prompt injection.

### 8.14 Upgrade path: OR-Tools

When the heuristic works end to end, replace `plan()`'s internals with a **Python microservice (FastAPI + Google OR-Tools)** exposing the same `PlanInput → PlanOutput` JSON contract.

- Model: pickup-and-delivery vehicle routing with capacity, time windows, optional nodes with a drop penalty (so infeasible cargo goes to `unassigned` instead of failing), and a cost objective built from §8.7.1 weights.
- Backhaul is modelled naturally: reverse-direction cargo are extra pickup-delivery pairs on the same vehicle.
- Node calls the service with a timeout (e.g. 10 s) and **falls back to the heuristic** if it errors. Same tests, same fixtures, so you can compare plan quality objectively.

---

## 9. REST API specification

Base path `/api`. JSON in, JSON out. Authentication: `Authorization: Bearer <JWT>`. The JWT payload is `{ sub, role, exp }`.

**Response envelope**

```jsonc
// success
{ "data": { ... } }
// error
{ "error": { "code": "VALIDATION_ERROR", "message": "quantity_tonnes must be > 0", "details": [ ... ] } }
```

Error codes: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409, e.g. illegal state transition), `INFEASIBLE` (422, the planner cannot satisfy constraints), `INTERNAL` (500).

### 9.1 Access matrix

| Resource | Owner | Operator | Admin |
|----------|:-----:|:--------:|:-----:|
| Own cargo (CRUD while pending) | ✅ | ❌ | ✅ (read all) |
| Quotes for own cargo | ✅ | ❌ | ✅ |
| Own boats and availability | ❌ | ✅ | ✅ (all) |
| Trips containing their boat | ❌ | ✅ | ✅ (all) |
| Shipments they own (read-only trip view) | ✅ | ❌ | ✅ |
| Optimize / publish plans | ❌ | ❌ | ✅ |
| Disruptions: raise | ❌ | ✅ (own boat) | ✅ |
| Disruptions: approve recovery plan | ❌ | ❌ | ✅ |
| Simulator, copilot, master data, users | ❌ | ❌ | ✅ |
| Own notifications | ✅ | ✅ | ✅ |

Every query that returns user data must filter by ownership server-side; never trust an id from the client.

### 9.2 Auth

| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/auth/register` | `{name,email,password,role,org_name?,phone?}` | `role` may be `cargo_owner` or `boat_operator`. Admin accounts are seeded only. |
| POST | `/auth/login` | `{email,password}` | Returns `{token, user}` |
| GET | `/auth/me` | | Current user |

### 9.3 Cargo and quotes (owner)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/cargo` | Create a job (status `draft`) and **return the quote** in the same response |
| GET | `/cargo` | Own jobs (admin: all, with `?status=&owner=`) |
| GET | `/cargo/:id` | Detail: job, latest quote, assignment, trip timeline, explanation |
| PATCH | `/cargo/:id` | Edit while `draft` or `pending` |
| POST | `/cargo/:id/request-booking` | Accept the quote → status `pending` (enters the planning pool) |
| POST | `/cargo/:id/cancel` | Allowed before the trip departs; triggers re-plan if it was in a published plan |
| GET | `/cargo/:id/quote` | Recompute and return a fresh quote |

**`POST /cargo` request**

```jsonc
{
  "cargo_type": "sand",
  "quantity_tonnes": 10,
  "description": "River sand for foundation",
  "pickup": { "address": "Edappally site, Kochi", "lat": 10.0261, "lng": 76.3084 },
  "drop":   { "address": "Alappuzha beach road", "lat": 9.4981, "lng": 76.3388 },
  "pickup_from": "2026-10-12T04:30:00Z",   // Monday morning IST
  "pickup_to":   "2026-10-12T07:30:00Z",
  "deliver_by":  "2026-10-13T12:30:00Z",   // Tuesday evening IST
  "urgency": "normal",
  "late_penalty_amount": 2000
}
```

**Response (abridged)**

```jsonc
{ "data": {
  "cargo": { "id":"…", "reference":"CG-2026-0001", "status":"draft", "origin_terminal":"KOC", "dest_terminal":"ALP" },
  "quote": {
    "recommended": "waterway",
    "waterway": { "pricePerTonne": 263, "total": 2628, "etaAt":"…", "co2Kg": 148, "roadPickupKm": 9, "roadDropKm": 4,
                  "note": "Estimate; final price is set when the network plan is published" },
    "road":     { "pricePerTonne": 360, "total": 3600, "etaAt":"…", "co2Kg": 372, "km": 60 },
    "explanation": "Waterway is 27% cheaper because B-104 can be matched with return cargo, reducing the cost of the empty journey."
  }
}}
```

### 9.4 Boats and availability (operator, admin)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/boats` | Create boat |
| GET | `/boats` | Operator: own; admin: all |
| PATCH | `/boats/:id` | Edit |
| POST | `/boats/:id/availability` | Add window `{start_terminal_id, available_from, must_return_by}` |
| DELETE | `/boats/:id/availability/:aid` | Remove window |
| POST | `/boats/:id/unavailable` | Report breakdown → creates a disruption (§9.7) |
| POST | `/boats/:id/available` | Mark available again |

### 9.5 Plans (admin)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/plans/optimize` | `{mode}` → runs the planner on all `pending` cargo and available boats; returns a **draft plan** with metrics, baseline and alternatives |
| GET | `/plans` | List (`?status=`) |
| GET | `/plans/:id` | Full plan: trips, legs, assignments, explanations, metrics, baseline |
| POST | `/plans/:id/publish` | Draft → published; creates bookings, sets trips `awaiting_operator`, sends notifications |
| POST | `/plans/:id/reject` | Draft → rejected |
| POST | `/plans/:id/compare` | `{modes:[...]}` → headline numbers for each mode (for the comparison card) |

**`POST /plans/optimize` response (abridged)**

```jsonc
{ "data": { "plan": {
  "id":"…", "status":"draft", "mode":"balanced",
  "metrics":         { "utilizationPct": 67.5, "emptyTrips": 0, "totalCost": 9560, "co2AvoidedKg": 430, "cargoMovedT": 27 },
  "baselineMetrics": { "utilizationPct": 38.0, "emptyTrips": 4, "totalCost": 18400, "co2AvoidedKg": 0,   "cargoMovedT": 27 },
  "alternatives": { "lowest_cost": {…}, "lowest_co2": {…}, "fastest": {…}, "balanced": {…} },
  "trips": [ { "boat":"B-104", "optimizationScore": 74.5, "legs":[…], "explanation": {…} } ],
  "unassigned": []
}}}
```

### 9.6 Trips (operator, admin, owner read)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/trips` | Operator: trips for own boats; admin: all (`?status=`) |
| GET | `/trips/:id` | Legs, cargo list, explanation |
| POST | `/trips/:id/accept` | Operator only; `awaiting_operator` → `confirmed`; cargo → `confirmed` |
| POST | `/trips/:id/decline` | `{reason}`; trip → `declined`; cargo → `pending`; admin notified; a recovery draft is generated |
| POST | `/trips/:id/events` | `{type:'departed'|'arrived'|'delay_reported', leg_id?, minutes?, note?}` → updates times, recomputes risk, may notify |

### 9.7 Disruptions (operator reports, admin resolves)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/disruptions` | `{type, boat_id?|terminal_id?|edge_id?, note}` → creates the disruption, computes affected cargo, generates a draft recovery plan, notifies |
| GET | `/disruptions` | List (`?state=active`) |
| GET | `/disruptions/:id` | Detail incl. affected cargo and the recovery plan summary (cost, penalty avoided, delay) |
| POST | `/disruptions/:id/approve` | Admin publishes the recovery plan |
| POST | `/disruptions/:id/reject` | Reject; admin must handle manually |
| POST | `/disruptions/:id/resolve` | Mark resolved (e.g. boat repaired) |

**`POST /disruptions` response (abridged)**

```jsonc
{ "data": { "disruption": { "id":"…", "type":"boat_unavailable", "state":"active" },
  "affected": { "shipments": 4, "tonnes": 27, "cargo": [ { "reference":"CG-2026-0001", "tonnes":10 }, … ] },
  "recoveryPlan": { "id":"…", "status":"draft",
      "additionalCost": 1200, "penaltyAvoided": 8000, "delayHours": 0,
      "reassignments": [ { "cargo":"CG-2026-0001", "from":"B-104", "to":"B-107" } ],
      "unassigned": [] } } }
```

### 9.8 Simulator and what-if (admin)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/simulations` | `{name?, scenario}` → runs `simulate()`; returns `{base, result, diff}`; saved |
| GET | `/simulations` | History |
| POST | `/simulations/:id/apply` | Creates a `draft` plan from the simulated result |
| POST | `/simulations/capacity` | `{demandPercent}` → daily capacity, projected demand, bottleneck route, recommendation |

### 9.9 Dashboard (admin)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/summary` | Fleet counts, KPIs (utilization, empty trips, cost/tonne, cargo delivered, CO₂ avoided), pending cargo count |
| GET | `/dashboard/network` | Terminals and edges with live statuses for the map (see below) |
| GET | `/dashboard/activity?limit=50` | Latest `activity_log` rows |
| GET | `/dashboard/comparison` | Latest published plan vs baseline, for the before/after card |

**Network status rule (map colours)**

| Status | Colour | Rule |
|--------|--------|------|
| Available | green | Terminal active, no active disruption, no boat currently using it |
| In transit | blue | A boat is currently on this edge (`in_transit` trip leg) |
| Delayed | amber | A trip on the edge/terminal has `delay_risk_pct ≥ threshold` or reported delay |
| Disrupted | red | Active disruption on the edge/terminal, or the edge is closed |

### 9.10 Notifications (all roles)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/notifications?unread=true&limit=30&cursor=` | Own notifications, newest first |
| GET | `/notifications/unread-count` | `{count}` |
| POST | `/notifications/:id/read` | Mark one read |
| POST | `/notifications/read-all` | Mark all read |
| GET | `/notifications/stream` | **SSE** stream (see §10.4) |

### 9.11 Master data and users (admin)

| Method | Path | Description |
|--------|------|-------------|
| GET/POST/PATCH | `/terminals`, `/edges` | CRUD for network master data; changing `is_open` / `is_active` should be possible without redeploy |
| GET/PUT | `/settings/:key` | Read and update `cost`, `co2`, `weights`, `delay` |
| GET/PATCH | `/users` | List; activate/deactivate |
| POST | `/admin/seed-demo` | Reset DB to demo seed (disable in production) |

### 9.12 Copilot (admin)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/copilot` | `{message}` → `{intent, params, result, summary}`; result is always a preview/draft |

---

## 10. Notification system

### 10.1 Goals

- Tell the right person, at the right moment, **what happened, which shipment or boat, what changed, and what they need to do**.
- Make decisions possible from the notification itself (Accept / Decline / Review plan).
- Do not create noise: routine events go to the admin **activity feed**, not to the bell.

### 10.2 Notification data model

Stored in `notifications` (§6.3).

| Field | Purpose |
|-------|---------|
| `type` | Machine key, e.g. `trip.request` |
| `severity` | `info`, `success`, `warning`, `critical` → colour and icon |
| `title` | Short headline, under 60 characters |
| `message` | One or two lines, outcome first, with numbers |
| `why` | Optional explainability line ("Matched because return cargo was available") |
| `related_*` | Deep-link context (cargo, boat, trip, plan, disruption) |
| `action` | Optional primary action: `{type:'accept_trip'|'decline_trip'|'review_plan'|'link', label, ...}` |
| `dedupe_key` | Prevents repeats (e.g. `delay:{tripId}:{hourBucket}`) |
| `read_at` | Null = unread |

### 10.3 Event catalogue

| Type | Recipient | Severity | Title | Message template | Action |
|------|-----------|----------|-------|------------------|--------|
| `quote.ready` | Owner | info | Your quote is ready | `{tonnes}T {cargoType}, {origin} → {dest}: {waterwayPrice}/T by water vs {roadPrice}/T by road. {recommendation}.` | View quote |
| `cargo.matched` | Owner | success | Your cargo is matched | `{tonnes}T {cargoType}, {origin} → {dest}. Boat {boat}, pickup {pickupTime}. {pricePerTonne}/T ({savingPct}% {cheaperOrDearer} than road).` | View plan |
| `trip.request` | Operator | info | New booking request | `{boat}: {cargoSummary}, {origin} → {dest}{returnClause}. Utilization {util}%. Estimated revenue {revenue}.` | **Accept** / **Decline** |
| `booking.confirmed` | Owner | success | Booking confirmed | `{boat} will pick up {tonnes}T on {pickupTime}. Delivery ETA {eta}.` | View timeline |
| `trip.declined` | Owner | info | Finding an alternative | `{boat} declined the trip. We're finding another boat; your deadline is still being protected.` | |
| `trip.declined.admin` | Admin | warning | Operator declined a trip | `{operator} declined {boat} ({tonnes}T, {reason}). Recovery plan ready.` | Review plan |
| `trip.departed` | Owner | info | On its way | `{boat} left {terminal} with your cargo. ETA {eta}.` | Track |
| `delay.warning` | Owner, Admin, Operator | warning | Possible delay | `{boat} expected {eta}, required {deadline}. Delay risk {risk}%. {cause}.` | See alternatives |
| `disruption.detected` | Admin | critical | {boat} unavailable | `{shipments} shipments, {tonnes}T affected. Recovery plan ready: {plan}. Additional cost {addCost}, penalty avoided {penalty}.` | **Review plan** |
| `disruption.operator` | Operator (boat owner) | critical | Your boat was marked unavailable | `Trips affected: {tripCount}. Admin is re-planning.` | |
| `recovery.published` | Admin | success | Recovery plan applied | `{shipments} shipments reassigned. Delay {delayHours} h.` | |
| `cargo.replanned` | Owner | info / warning | Your shipment was re-planned | `New boat {boat}. Delivery {onTimeOrDelayed}. {noActionNeeded}` | View |
| `trip.cancelled` | Operator | warning | Trip cancelled | `{boat}'s trip {tripRef} was cancelled by a re-plan. No penalty applies.` | |
| `plan.published` | Admin | success | Plan published | `{tripCount} trips, {tonnes}T, {util}% utilization. Operators notified.` | |
| `delivered` | Owner | success | Delivered | `{tonnes}T {cargoType} reached {dest}. CO₂ avoided: {co2Avoided} kg.` | View receipt |
| `capacity.alert` | Admin | warning | Capacity bottleneck | `{route} demand exceeds capacity by {gapT}T. Suggested: add {n} boat(s).` | Open simulator |

**Copy rules**
1. Lead with the outcome, not the system event ("Your delivery is still on time", not "B-104 reassigned").
2. Always include numbers where they exist (price, time, tonnes, CO₂).
3. Show an action button only when a decision is needed; informational messages ask for nothing.
4. Use the `why` line when the engine made a non-obvious choice.
5. Titles are scannable. No jargon.

### 10.4 Delivery mechanism

```text
Event happens in a service
   │
   ▼
notificationService.notify({ userIds, type, severity, title, message, why, related, action, dedupeKey })
   │  1. Insert one row per recipient (ON CONFLICT (user_id, dedupe_key) DO NOTHING)
   │  2. Write a summary row to activity_log if the event is system-wide
   │  3. Push to every open SSE connection for each recipient
   ▼
GET /api/notifications/stream   (text/event-stream)
   event: notification   data: { …notification row… }
   event: unread-count   data: { count }
   : keep-alive comment every 25 s
```

**Implementation notes**
- Keep an in-memory `Map<userId, Set<Response>>` of open SSE responses. This is fine for one server process; for multiple processes, use Postgres `LISTEN/NOTIFY` or Redis pub/sub.
- Browsers' `EventSource` cannot send an `Authorization` header. Either use `@microsoft/fetch-event-source` (supports headers), or accept a short-lived stream token in the query string issued by `POST /notifications/stream-token`.
- **Polling fallback:** if the stream errors, the client falls back to `GET /notifications?since=<ts>` every 10 seconds.
- On reconnect, the client fetches missed items using the last seen `created_at`.
- Notifications are retained for 90 days (a cleanup job is optional for the MVP).
- Optional later channels: email (Nodemailer), SMS/WhatsApp (via a provider). Gate each by user preference. Do not build these before the in-app version works.

### 10.5 Client behaviour

| Element | Behaviour |
|---------|-----------|
| **Bell icon** (top bar) | Shows an unread badge (cap at `9+`). Click opens a popover anchored to the bell. |
| **Popover list** | Grouped *New* / *Earlier*. Each row: severity icon, title, message (2 lines), relative time, optional action button. |
| **Inline actions** | Operators can Accept or Decline directly from the row. The row updates in place and confirms the result. |
| **Toast** | Appears for `warning` and `critical`, and for `success` events the user is actively waiting on. Info goes to the bell silently. Auto-dismiss after 6 s (critical stays until dismissed). Toasts stack with a max of 3. |
| **Deep link** | Clicking a row marks it read and navigates to the related cargo/trip/plan/disruption. |
| **Mark all read** | One control at the top of the popover. |
| **Filters** | *All* / *Needs action* / *Alerts*. |
| **Accessibility** | The toast region is `aria-live="polite"` (critical: `assertive`). Every status has an icon and text, never colour alone. Keyboard: bell is focusable, `Esc` closes the popover. |
| **Reduced motion** | Toasts cross-fade instead of sliding (see §11.6). |

### 10.6 Admin activity feed (separate from the bell)

A rolling list on the dashboard, fed by `activity_log`. It includes routine events that do **not** warrant a notification: *cargo posted*, *boat listed*, *plan drafted*, *operator accepted*, *trip departed/arrived*. Each line is a single human-readable sentence with a timestamp. It is what makes the demo feel alive without spamming anyone.

### 10.7 Demo note

For the live demo, open two browser windows (Owner and Admin, or Operator and Admin). Click **B-104 Unavailable** and both screens update at the same moment: the admin gets the critical toast and recovery plan, the affected owner gets "Your shipment was re-planned".

---

## 11. Frontend specification and Apple-style design system

The interface follows Apple's design principles as translated for the web: **instant response, direct manipulation, interruptible spring motion, translucent materials for hierarchy, restrained typography, and accessibility built in.** This section is binding for every screen.

### 11.1 Design principles applied to this product

| Principle | What it means here |
|-----------|--------------------|
| **Purpose** | Each screen has one job. The owner posts and tracks cargo. The operator decides on trips. The admin sees the network and decides on plans. Anything else is one level deeper. |
| **Agency** | The engine recommends; people decide. Plans are always drafts until a person presses Publish or Approve. Every destructive action is undoable where possible; confirmation dialogs are used only for cancelling a confirmed trip or rejecting a recovery plan. |
| **Responsibility** | Never present a placeholder number as fact. Estimates are labelled *Estimate*. A negative CO₂ saving is shown honestly. The "road is better" outcome is shown plainly. |
| **Familiarity** | Standard patterns: tab bar on mobile, sidebar on desktop, sheets for decisions, popovers for the bell, segmented controls for modes. Close is always top-left on sheets; primary action is bottom-right. |
| **Flexibility** | Responsive from 360 px phones (operators on boats) to desktop control rooms. Light and dark. Text scales with the user's setting. |
| **Simplicity** | Show the common path first. The quote card shows price, saving and one sentence of why. Advanced details (score breakdown, rejected alternatives, legs) live one tap deeper. |
| **Craft** | A 4 pt spacing grid, one type scale, one spring vocabulary, one set of materials. Nothing is random. |
| **Delight** | It comes from the other seven: numbers settling with a spring, a plan card that materializes, a map that responds instantly. No confetti. |

### 11.2 Libraries

`react`, `react-router-dom`, `@tanstack/react-query`, `motion` (`motion/react`), `tailwindcss`, `react-leaflet` + `leaflet`, `recharts`, `lucide-react`, `zod`, `@microsoft/fetch-event-source`, `date-fns` + `date-fns-tz`.

### 11.3 Design tokens

Define tokens as CSS variables so light, dark and the accessibility media queries are a variable swap.

```css
/* src/styles/tokens.css */
:root {
  /* Surfaces */
  --bg:            #F5F5F7;
  --surface:       #FFFFFF;
  --surface-2:     #FAFAFC;
  --separator:     rgba(60, 60, 67, 0.12);

  /* Text */
  --text:          #1D1D1F;
  --text-2:        #6E6E73;
  --text-3:        #8E8E93;

  /* Accent and status (each is always paired with an icon + label) */
  --accent:        #007AFF;
  --success:       #34C759;
  --warning:       #FF9F0A;
  --critical:      #FF3B30;
  --transit:       #5E9BFF;

  /* Materials (translucent layers) */
  --glass-bg:        rgba(255, 255, 255, 0.62);
  --glass-bg-thick:  rgba(255, 255, 255, 0.78);
  --glass-edge:      rgba(255, 255, 255, 0.45);
  --glass-blur:      20px;
  --glass-blur-thick:32px;
  --scrim:           rgba(0, 0, 0, 0.32);

  /* Shape and elevation */
  --r-sm: 10px; --r-md: 14px; --r-lg: 20px; --r-xl: 28px; --r-pill: 999px;
  --shadow-1: 0 1px 2px rgba(0,0,0,.06), 0 1px 1px rgba(0,0,0,.04);
  --shadow-2: 0 8px 24px rgba(0,0,0,.10), 0 2px 6px rgba(0,0,0,.06);
  --shadow-3: 0 24px 60px rgba(0,0,0,.18), 0 6px 16px rgba(0,0,0,.10);

  /* 4pt spacing: use Tailwind's scale (1 = 4px) */
}

:root[data-theme="dark"] {
  --bg: #000000;  --surface: #1C1C1E;  --surface-2: #2C2C2E;
  --separator: rgba(84, 84, 88, 0.55);
  --text: #F5F5F7; --text-2: #A1A1A6; --text-3: #8E8E93;
  --accent: #0A84FF; --success: #30D158; --warning: #FFB340; --critical: #FF453A; --transit: #64A8FF;
  --glass-bg: rgba(28, 28, 30, 0.62);
  --glass-bg-thick: rgba(28, 28, 30, 0.80);
  --glass-edge: rgba(255, 255, 255, 0.10);
  --scrim: rgba(0, 0, 0, 0.55);
}
```

> Set `data-theme` on `<html>` from the user's saved preference, falling back to `prefers-color-scheme` on first load. Ease the switch (animate `background-color` over about 250 ms) so there is no abrupt brightness jump.

### 11.4 Tailwind configuration

```js
// tailwind.config.js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', surface: 'var(--surface)', 'surface-2': 'var(--surface-2)',
        text: 'var(--text)', 'text-2': 'var(--text-2)', 'text-3': 'var(--text-3)',
        accent: 'var(--accent)', success: 'var(--success)', warning: 'var(--warning)',
        critical: 'var(--critical)', transit: 'var(--transit)', separator: 'var(--separator)',
      },
      borderRadius: { sm: 'var(--r-sm)', md: 'var(--r-md)', lg: 'var(--r-lg)', xl: 'var(--r-xl)' },
      boxShadow: { 1: 'var(--shadow-1)', 2: 'var(--shadow-2)', 3: 'var(--shadow-3)' },
      fontFamily: {
        sans: ['-apple-system','BlinkMacSystemFont','"SF Pro Text"','"SF Pro Display"','Inter','system-ui','"Segoe UI"','sans-serif'],
        mono: ['ui-monospace','"SF Mono"','Menlo','monospace'],
      },
      fontSize: {
        // [size, { lineHeight, letterSpacing, fontWeight }]  tracking tightens as size grows
        'display': ['3rem',    { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '700' }],
        'title-1': ['2rem',    { lineHeight: '1.12', letterSpacing: '-0.022em', fontWeight: '700' }],
        'title-2': ['1.5rem',  { lineHeight: '1.18', letterSpacing: '-0.018em', fontWeight: '650' }],
        'title-3': ['1.25rem', { lineHeight: '1.25', letterSpacing: '-0.012em', fontWeight: '600' }],
        'body':    ['1rem',    { lineHeight: '1.5',  letterSpacing: '0',        fontWeight: '400' }],
        'callout': ['0.9375rem',{lineHeight: '1.45', letterSpacing: '0',        fontWeight: '400' }],
        'caption': ['0.8125rem',{lineHeight: '1.4',  letterSpacing: '0.005em',  fontWeight: '500' }],
        'micro':   ['0.75rem', { lineHeight: '1.35', letterSpacing: '0.01em',   fontWeight: '500' }],
      },
    },
  },
};
```

### 11.5 Typography rules

- Use the **system font stack**; do not load a custom face unless a specific reason exists.
- **Tracking is size-specific:** negative on large text, near zero on body, slightly positive on small text. Never apply one `letter-spacing` to everything.
- **Leading shrinks as size grows.** Tight on titles (about 1.1), comfortable on body (1.5).
- Build hierarchy with **weight + size + leading together**. Emphasize with weight, not colour or underline.
- Spacing in `rem`/Tailwind units so the layout scales with the user's text size.
- Numbers (prices, tonnes, percentages) use `font-variant-numeric: tabular-nums` so columns do not jitter while counting.
- Currency format: `₹` + Indian digit grouping (`new Intl.NumberFormat('en-IN')`). Dates: `Asia/Kolkata`, 12-hour with AM/PM.

### 11.6 Materials, depth and motion

#### Materials

```css
/* src/styles/materials.css */
.glass        { background: var(--glass-bg);       backdrop-filter: blur(var(--glass-blur)) saturate(180%);
                -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(180%);
                border-top: 1px solid var(--glass-edge); }            /* bright top edge = light catching the material */
.glass-thick  { background: var(--glass-bg-thick); backdrop-filter: blur(var(--glass-blur-thick)) saturate(180%);
                -webkit-backdrop-filter: blur(var(--glass-blur-thick)) saturate(180%);
                border-top: 1px solid var(--glass-edge); box-shadow: var(--shadow-3); }  /* bigger surfaces read as thicker */

@media (prefers-reduced-transparency: reduce) {
  .glass, .glass-thick { background: var(--surface); backdrop-filter: none; -webkit-backdrop-filter: none; }
}
@media (prefers-contrast: more) {
  .glass, .glass-thick { background: var(--surface); backdrop-filter: none; border: 1px solid var(--text-2); }
}
```

**Where each material is used**

| Surface | Material | Notes |
|---------|----------|-------|
| Top bar / tab bar | `.glass` | Content scrolls underneath; use a **scroll-edge fade** (a small gradient mask) instead of a 1 px divider |
| Notification popover, menus | `.glass` | Anchored to the trigger |
| Approval sheets (publish plan, approve recovery) | `.glass-thick` + scrim | Modal decisions dim the background and push it back slightly |
| Sidebar (admin) | Solid `--surface-2` | Structural regions use the heavier, opaque look |
| Cards | Solid `--surface` + `--shadow-1` | Cards are content, not chrome |

**Rules:** never stack a light translucent surface on another; over blurred surfaces use `--text` (not flat grey) at a slightly heavier weight; put colour on solid layers (icons, chips), not on translucent text.

#### Motion: springs, not durations

Use `motion/react` springs for everything the user can touch. Do not use CSS transitions or keyframes for gesture-driven movement (they cannot be grabbed and reversed).

```js
// src/lib/motion.js
export const spring = {
  // critically damped: default for UI (no overshoot)
  ui:       { type: 'spring', bounce: 0,   duration: 0.4 },
  // moving things around
  move:     { type: 'spring', bounce: 0,   duration: 0.4 },
  // sheets and drawers
  sheet:    { type: 'spring', bounce: 0.2, duration: 0.3 },
  // only after a flick or throw (momentum-driven)
  momentum: { type: 'spring', bounce: 0.2, duration: 0.4 },
  // number count-up for KPIs
  number:   { type: 'spring', bounce: 0,   duration: 0.8 },
};
export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// When reduced motion is on: replace slides/springs with a 200 ms opacity cross-fade; drop overshoot.
```

**Interaction rules (checklist for every component)**

1. **Respond on pointer-down.** Buttons and cards scale to `0.97` instantly on press, then commit on release. No debounce on the input path.
2. **Track 1:1 during gestures.** Sheets and draggable cards follow the pointer exactly, honouring the offset where it was grabbed. Use Pointer Events with `setPointerCapture`.
3. **Always interruptible.** Never block input during a transition. A closing sheet that is grabbed again follows the finger. Animate from the element's **current on-screen value**, never from the target value.
4. **Hand off velocity.** On release, pass the pointer's velocity into the spring. Choose the destination by **projecting momentum**: `projected = position + (v/1000) × d/(1−d)` with `d = 0.998`, then snap to the nearest snap point. Decide dismiss vs. stay by velocity sign, not position alone.
5. **Symmetric paths and anchored origins.** A sheet that rises from the bottom dismisses to the bottom. A popover scales from its trigger (`transform-origin` at the bell icon). A card that expands from a list row collapses back into that row.
6. **Rubber-band at boundaries.** Sheets resist progressively when dragged past their limits instead of hard-stopping.
7. **Materialize, don't just fade.** Glass surfaces animate blur radius and scale together when they appear.
8. **Reduced motion** replaces movement with cross-fades but keeps feedback (colour and opacity changes that aid comprehension).
9. **Feedback only where it earns its place.** No sound; no haptics beyond optional `navigator.vibrate(10)` on Accept/Decline on mobile.

```jsx
// Press feedback: instant, on pointer-down
<motion.button whileTap={{ scale: 0.97 }} transition={{ duration: 0.1 }} className="…" />

// Number that settles with a spring
function AnimatedNumber({ value, format }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, v => format(Math.round(v)));
  useEffect(() => { const c = animate(mv, value, spring.number); return c.stop; }, [value]);
  return <motion.span className="tabular-nums">{text}</motion.span>;
}

// Drag-to-dismiss sheet with momentum projection
const project = (v, d = 0.998) => (v / 1000) * d / (1 - d);
<motion.div drag="y" dragConstraints={{ top: 0 }} dragElastic={0.55}   // rubber-band
  onDragEnd={(_, info) => {
    const end = info.point.y + project(info.velocity.y);
    (info.velocity.y > 300 || end > sheetHeight * 0.5) ? close() : snapBack();   // animate({ y: 0 }, { ...spring.sheet, velocity: info.velocity.y })
  }} />
```

### 11.7 Application shell

| Breakpoint | Layout |
|------------|--------|
| < 768 px | Large-title top bar (`.glass`), content, bottom **tab bar** (`.glass`), 3-5 tabs per role. Sheets rise from the bottom. Touch targets at least 44 px. |
| ≥ 768 px | Left **sidebar** (solid), top bar with the bell, command bar trigger (`⌘K`) for the admin. Sheets become centred panels or right-hand inspectors. |

**Navigation per role**

| Owner | Operator | Admin |
|-------|----------|-------|
| Shipments · New cargo · Account | Requests · Trips · Boats · Account | Overview · Optimize · Network · Disruptions · Simulator · Data |

Labels name their contents ("Shipments", "Requests"), not vague umbrellas ("Home"). Every screen answers: *where am I, where can I go, what is here, how do I get out*.

### 11.8 Screens and components

#### Owner

| Route | Screen | Contents |
|-------|--------|----------|
| `/owner` | **Shipments** | List of cargo with status chip, route, tonnes, ETA. Empty state: "No shipments yet. Post your first cargo." |
| `/owner/new` | **New cargo** | Single-column form. Cargo type (segmented), quantity (stepper), pickup and drop (address + **map pin picker**), pickup window, deadline, urgency. Inline validation. On submit the **Quote card** appears in place. |
| `/owner/cargo/:id` | **Shipment detail** | Quote card, **journey timeline** (Road pickup → Terminal → Boat → Terminal → Road delivery), live status, map, **Why this plan** panel (collapsible), cancel button (until departure). |

**Quote card (the most important component)**

```text
┌────────────────────────────────────────────┐
│  Recommended: Waterway                      │
│  ₹263 / tonne          Road ₹360 / tonne    │
│  ████████████░░░░  27% cheaper              │   ← CompareBar (animated with spring.ui)
│                                            │
│  ETA Tue 5:40 PM   ·   CO₂ −224 kg         │
│  Your price is lower because B-104 has a   │
│  return load, reducing the empty journey.  │
│                                            │
│  [ Request booking ]          Details ›    │
└────────────────────────────────────────────┘
```
When road wins, the header reads "Recommended: Road" and the explanation says why (for example, "The nearest terminal adds 42 km of road travel"). This honesty is a feature.

#### Operator

| Route | Screen | Contents |
|-------|--------|----------|
| `/operator` | **Requests** | "Needs your decision" cards at the top, each with route, cargo list, utilization ring, estimated revenue, **Accept** and **Decline** (decline opens a reason sheet). |
| `/operator/trips` | **Trips** | Upcoming and active trips. Active trip shows buttons: *Departed*, *Arrived*, *Report delay*. |
| `/operator/boats` | **Boats** | Boat cards (status chip), add/edit sheet, availability windows, **Report breakdown** (destructive; confirms once). |

#### Admin

| Route | Screen | Contents |
|-------|--------|----------|
| `/admin` | **Overview** | KPI tiles (Fleet utilization, Empty trips, Avg cost/tonne, Cargo delivered, CO₂ avoided) with animated numbers; Live fleet (available / in transit / unavailable); **Activity feed**; before/after comparison card; pending cargo count with an **Optimize Network** button. |
| `/admin/optimize` | **Optimize** | Mode **segmented control** (Lowest cost · Lowest CO₂ · Fastest · Balanced) → big **Optimize Network** button → result: **Before / After table**, trip cards (each with route diagram, load bar, score ring, *Why B-104?* panel), mode comparison strip (cost, CO₂, late risk per mode), **Publish plan** (opens approval sheet). |
| `/admin/network` | **Network (digital twin)** | Leaflet map: terminals as nodes, edges as lines coloured by status (green / blue / amber / red, each with an icon and legend), boats as markers with code and load. Tap a node/edge/boat for an inspector. A **Simulate** side panel applies scenarios to a copy of this view. |
| `/admin/disruptions` | **Disruptions** | Active list. **Boat Unavailable** action (from a boat inspector or a button). After the click: a **Recovery sheet** shows affected shipments, proposed reassignments (from → to), additional cost, penalty avoided, delay hours, unplaceable cargo with options, **Approve plan** / **Reject**. |
| `/admin/simulator` | **Simulator** | Scenario builder (add boats, remove boat, demand ±%, close route, disable terminal, road cost ±%). Result: Current vs Simulation table with deltas in green/red plus an arrow icon, and "Apply as plan". |
| `/admin/data` | **Data** | Terminals, edges (open/closed toggle), settings editors (cost, CO₂, weights), users. |
| (global) | **Command bar** | `⌘K` or a floating button. Natural-language input → copilot response card with a preview and an explicit **Apply** button. |

**Reusable components**

`AppShell`, `TopBar`, `TabBar`, `Sidebar`, `NotificationBell`, `NotificationPopover`, `ToastRegion`, `Sheet`, `Popover`, `SegmentedControl`, `StatusChip`, `KpiTile`, `AnimatedNumber`, `CompareBar`, `UtilizationRing`, `ScoreRing`, `LoadBar`, `JourneyTimeline`, `RouteDiagram`, `WhyPanel`, `BeforeAfterTable`, `PlanTripCard`, `ModeComparisonStrip`, `NetworkMap`, `ScenarioBuilder`, `DeltaTable`, `ActivityFeed`, `CommandBar`, `EmptyState`, `Skeleton`, `FormField`, `MapPinPicker`.

#### Status chips (text + icon + colour)

| Status | Label | Icon | Colour |
|--------|-------|------|--------|
| available | Available | check-circle | `--success` |
| in_transit | In transit | navigation | `--transit` |
| delayed | Delayed | clock | `--warning` |
| disrupted / unavailable | Disrupted | alert-triangle | `--critical` |
| awaiting_operator | Awaiting operator | hourglass | `--text-2` |
| confirmed | Confirmed | badge-check | `--success` |

### 11.9 State and data fetching

- **TanStack Query** for server state. Query keys: `['cargo']`, `['cargo', id]`, `['plans']`, `['plan', id]`, `['trips']`, `['dashboard']`, `['notifications']`.
- When a notification arrives over SSE, **invalidate** the related query keys so lists refresh without a page reload.
- A tiny `AuthContext` (token + user) and a `NotificationContext` (stream + unread count). No global store library is required.
- Optimistic updates for Accept/Decline and mark-read; roll back and show an inline error on failure.
- Long actions (Optimize Network) show a skeleton of the result layout and stay interruptible (a Cancel control aborts the request).

### 11.10 UX details that matter

- **Inline validation** (on blur), never only on submit. Specific error text ("Deadline must be after pickup").
- **Loading:** skeletons shaped like the final content. No full-screen spinners.
- **Errors:** inline, with a retry action; never a blocking alert.
- **Empty states:** one sentence plus one primary action.
- **Undo** where reasonable (for example, "Notification marked read · Undo").
- **Accessibility:** WCAG AA contrast, visible focus rings, all controls reachable by keyboard, semantic landmarks, `aria-live` for toasts and plan results, never colour alone, respect `prefers-reduced-motion`, `prefers-reduced-transparency` and `prefers-contrast`.
- **Time:** show the user's timezone once in the footer of time-heavy screens; store UTC.
- **Map:** OSM tiles with attribution; fall back to a simple SVG schematic of the network if tiles fail to load.

---

## 12. Project structure

```text
smart-waterway/
├── docker-compose.yml                # postgres:16
├── README.md
├── server/
│   ├── package.json
│   ├── .env.example
│   ├── prisma/
│   │   ├── schema.prisma             # derived from §6
│   │   └── seed.js                   # §13
│   └── src/
│       ├── index.js                  # boots Express, SSE, delay watcher
│       ├── app.js                    # middleware + route mounting
│       ├── config.js                 # env parsing (zod)
│       ├── db.js                     # Prisma client
│       ├── middleware/
│       │   ├── auth.js               # verify JWT, attach req.user
│       │   ├── requireRole.js
│       │   ├── validate.js           # zod request validation
│       │   └── errorHandler.js       # envelope + error codes
│       ├── routes/                   # thin: parse, authorize, call service
│       │   ├── auth.routes.js  cargo.routes.js  boats.routes.js  plans.routes.js
│       │   ├── trips.routes.js  disruptions.routes.js  simulations.routes.js
│       │   ├── dashboard.routes.js  notifications.routes.js  admin.routes.js  copilot.routes.js
│       ├── services/                 # load state from DB → call engine → persist
│       │   ├── cargo.service.js  quote.service.js  plan.service.js  trip.service.js
│       │   ├── disruption.service.js  simulation.service.js  dashboard.service.js
│       │   ├── notification.service.js  sse.hub.js  activity.service.js  copilot.service.js
│       ├── engine/                   # PURE functions, no db / express (§8)
│       │   ├── index.js              # plan(), simulate(), replan(), quote()
│       │   ├── network.js  feasibility.js  cost.js  co2.js
│       │   ├── construct.js  improve.js  score.js  explain.js
│       │   ├── baseline.js  replan.js  delay.js  simulate.js
│       │   └── __tests__/            # Vitest; fixtures in __fixtures__/
│       ├── jobs/
│       │   └── delayWatcher.js       # setInterval, every settings.delay.checkIntervalSec
│       └── utils/                    # time.js, geo.js, money.js, ids.js
└── client/
    ├── package.json  vite.config.js  tailwind.config.js  postcss.config.js
    ├── index.html
    └── src/
        ├── main.jsx  App.jsx  routes.jsx
        ├── styles/    tokens.css  materials.css  index.css
        ├── lib/       api.js  motion.js  format.js  time.js  sse.js
        ├── context/   AuthContext.jsx  NotificationContext.jsx
        ├── hooks/     useDrag.js  usePressable.js  useReducedMotion.js
        ├── components/ …              # §11.8 list, grouped: ui/, charts/, map/, notifications/
        └── pages/
            ├── auth/       Login.jsx  Register.jsx
            ├── owner/      Shipments.jsx  NewCargo.jsx  ShipmentDetail.jsx
            ├── operator/   Requests.jsx  Trips.jsx  Boats.jsx
            └── admin/      Overview.jsx  Optimize.jsx  Network.jsx  Disruptions.jsx
                            Simulator.jsx  Data.jsx
```

---

## 13. Seed data and demo script

### 13.1 Seed data

Run `POST /api/admin/seed-demo` or `npx prisma db seed`. **All distances, costs and times below are placeholders [ASSUMPTION]; verify real figures before making any public claim.**

**Terminals**

| Code | Name | Lat | Lng | Handling ₹/T | Turnaround h |
|------|------|-----|-----|--------------|--------------|
| KOC | Kochi | 9.9312 | 76.2673 | 30 | 1.0 |
| ALP | Alappuzha | 9.4981 | 76.3388 | 30 | 1.0 |
| KTM | Kottayam | 9.5916 | 76.5222 | 30 | 1.0 |
| KLM | Kollam | 8.8932 | 76.6141 | 30 | 1.0 |

**Waterway edges (create both directions)**

| From ↔ To | Distance km |
|-----------|-------------|
| KOC ↔ ALP | 55 |
| KOC ↔ KTM | 65 |
| ALP ↔ KTM | 30 |
| ALP ↔ KLM | 75 |

**Users** (password `demo1234`, change before any deployment)

| Email | Role | Org |
|-------|------|-----|
| `admin@waterway.test` | admin | Network Control |
| `owner1@waterway.test` | cargo_owner | Malabar Constructions |
| `owner2@waterway.test` | cargo_owner | Periyar Builders |
| `op1@waterway.test` | boat_operator | Vembanad Boats |
| `op2@waterway.test` | boat_operator | Kuttanad Carriers |

**Boats**

| Code | Operator | Capacity T | Home / current | ₹/km loaded | Fuel L/km | Speed km/h |
|------|----------|-----------|----------------|-------------|-----------|------------|
| B-104 | op1 | 20 | KOC | 45 | 6 | 10 |
| B-107 | op1 | 15 | KOC | 40 | 5 | 10 |
| B-109 | op2 | 10 | KOC | 32 | 4 | 10 |
| B-112 | op2 | 15 | ALP | 38 | 5 | 10 |

B-112 is an idle spare that makes the disruption demo recover cleanly.

Availability for all: from Monday 08:00 IST to Tuesday 23:00 IST (the demo week).

**Cargo (demo set)**

| Ref | Owner | Cargo | Tonnes | Route | Window / deadline | Late penalty |
|-----|-------|-------|--------|-------|-------------------|--------------|
| CG-D1 | owner1 | sand | 10 | KOC → ALP | Mon 06:00-10:00, Tue 18:00 | ₹3,000 |
| CG-D2 | owner1 | cement | 6 | KOC → ALP | Mon 06:00-10:00, Tue 18:00 | ₹2,000 |
| CG-D3 | owner2 | construction_material | 7 | ALP → KOC | Mon 14:00-20:00, Tue 20:00 | ₹3,000 |
| CG-D4 | owner2 | bricks | 4 | KOC → ALP | Mon 06:00-10:00, Tue 18:00 | ₹1,000 |

Incompatibility rows: `(grain, sand)`, `(grain, cement)`, `(cement, sand)` is **not** listed so the pooling demo works.

### 13.2 Do not hard-code the demo outcome

The engine decides. With these seed numbers a correct plan may put **all 20T on B-104** (an exact fit) with the 7T return load, leaving B-107 and B-109 idle. That is a *better* result than a two-boat plan, so do not force one. If you want the demo to show multiple boats, add a cargo that cannot share B-104 (for example a 9T job with an early deadline, or one with an incompatible cargo type). The before/after numbers shown on stage must come from the engine; they will not match any figure in the earlier concept notes, and that is correct.

Likewise, when B-104 is disrupted, B-107 (15T) cannot take the full 20T outbound load because cargo is not split. Expect the engine to use B-107, B-112 and/or B-109 across the affected jobs, or to list one job as needing attention. B-112 exists so that the recovery has a clean, feasible answer; remove it to show the "needs attention" path instead.

### 13.3 Demo script (8 minutes)

| Step | Who (browser window) | Action | What the audience sees |
|------|----------------------|--------|------------------------|
| 1 | Owner | Post 10T sand KOC → ALP | **Quote card**: waterway vs road, honest explanation. Show one quote where road wins (post a single 3T job with a far terminal) to prove it is not rigged. |
| 2 | Owner / Admin | Post the other cargo; Admin overview shows 4 pending jobs and the **Before** baseline (one cargo per boat, empty returns) | Low utilization, empty trips, higher cost |
| 3 | Admin | Pick **Balanced**, press **Optimize Network** | Plan appears with a spring: trips, utilization rings, **Before / After** table, mode comparison strip |
| 4 | Admin | Open **Why B-104?** | Checklist, rejected boats with real reasons, score breakdown |
| 5 | Admin | **Publish plan** | Operators and owners get notifications at once (two windows visible) |
| 6 | Operator | **Accept** from the bell popover | Owner window: "Booking confirmed" toast |
| 7 | Operator or Admin | **Boat Unavailable** on B-104 | Admin: critical toast + **Recovery sheet** (reassignments, additional cost, penalty avoided). Owner window: "Your shipment was re-planned" |
| 8 | Admin | **Approve plan** | Network map recolours; fleet counts update |
| 9 | Admin | Simulator or command bar: "What if demand increases by 30%?" | Capacity, bottleneck route, recommendation with re-run evidence |
| 10 | Admin | Final comparison card | Traditional vs Smart numbers from the engine |

**Pre-demo checklist:** reset the DB; confirm the SSE stream is connected in all windows; verify the planner output once; keep a screen recording as a backup; test the copilot's offline fallback phrases.

---

## 14. Build order

Each milestone ends with something demonstrable. If time runs short, stop at the **cut line**.

| # | Milestone | Deliverable | Rough effort |
|---|-----------|-------------|--------------|
| 0 | Setup | Repo, Docker Postgres, Prisma schema from §6, `.env`, seed script, Vite + Tailwind with tokens and materials | 2-3 h |
| 1 | Auth and roles | Register/login, JWT, `requireRole`, role-based routing and shell with tab bar/sidebar | 3 h |
| 2 | **Engine core + tests** | `network`, `feasibility`, `cost`, `co2`, `construct` (pooling + backhaul), `baseline`, `score`, `explain` with Vitest fixtures for the §13 data | 8-10 h |
| 3 | Owner flow | Post cargo, **quote card** (waterway vs road, honest recommendation), request booking, shipment list/detail | 5 h |
| 4 | Optimize + publish | `POST /plans/optimize`, Optimize screen with before/after, trip cards, Why panel, publish sheet | 6 h |
| 5 | Operator flow | Boats CRUD, availability, trip requests, accept/decline, trip events | 4 h |
| 6 | **Notifications** | Service, SSE hub, bell, popover, toasts, inline actions, activity feed | 5 h |
| 7 | **Disruption re-planning** | `replan`, disruption API, Recovery sheet, approve/reject | 5 h |
| | **— CUT LINE (core demo works) —** | | |
| 8 | Admin dashboard and network map | KPIs, fleet counts, Leaflet map with status colours | 4 h |
| 9 | Delay watcher | Risk score, `delay.warning` notifications, "Report delay" button | 3 h |
| 10 | Modes and simulator | Mode comparison, `simulate`, scenario builder, capacity analysis | 5 h |
| 11 | Copilot | Command bar, intent allow-list, regex fallback, optional LLM | 3 h |
| 12 | Polish | Motion pass (springs, interruptibility, reduced-motion), accessibility pass, empty/error states, demo rehearsal | 4-6 h |

**Order advice:** build the engine and its tests **before** any UI. If the planner is wrong, nothing else matters. Write at least one test per hard constraint in §8.3.

---

## 15. Configuration, security and testing

### 15.1 Environment variables

```bash
# server/.env.example
DATABASE_URL=postgresql://waterway:waterway@localhost:5432/waterway
JWT_SECRET=change-me-to-a-long-random-string
JWT_EXPIRES_IN=8h
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
TZ=UTC
# Optional (copilot)
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
# Optional (production)
NODE_ENV=development
```

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16
    environment: { POSTGRES_USER: waterway, POSTGRES_PASSWORD: waterway, POSTGRES_DB: waterway }
    ports: ["5432:5432"]
    volumes: [ "pgdata:/var/lib/postgresql/data" ]
volumes: { pgdata: {} }
```

### 15.2 Security checklist

- Hash passwords with `bcrypt` (cost 10-12). Never log passwords or tokens.
- JWT with a strong secret and an expiry. Re-check the user's `is_active` flag on each request.
- **Authorize by role and ownership on the server** for every route (see §9.1). Never trust an id or role sent by the client.
- Validate every request body, query and param with `zod`. Reject unknown fields.
- Use Prisma parameterized queries only; no string-built SQL.
- `helmet`, CORS restricted to `CLIENT_ORIGIN`, and rate limiting on `/auth/*` and `/copilot`.
- `/admin/seed-demo` is disabled when `NODE_ENV=production`.
- Copilot: the API key stays on the server; LLM output is parsed against an allow-list; it can only create drafts; user-controlled text is treated as untrusted.
- Store only what you need; do not put personal data into `activity_log.payload` beyond ids.
- Run a state-transition guard (§7) in services so illegal transitions return `409 CONFLICT`.

### 15.3 Testing plan

| Layer | What | Tool |
|-------|------|------|
| Engine unit tests | One test per hard constraint (capacity, time window, compatibility, return-by, range, closed edge); pooling fills a boat exactly; backhaul attached when feasible and not when late; empty return costed honestly; quote picks road when it should; cost allocation sums to trip cost; CO₂ allocation sums to trip CO₂ | Vitest |
| Determinism | Same input and seed gives identical output (plans and simulations) | Vitest |
| Replan | Disrupted boat removed; frozen trips unchanged; unplaceable cargo reported, not dropped | Vitest |
| Invariants | No boat overlaps; every cargo is either assigned once or in `unassigned`; metrics equal the sum of trips | Vitest (property-style) |
| API smoke | Auth, role denial (403), ownership (cannot read another owner's cargo), state transitions (409), optimize → publish → accept → disrupt → approve | Supertest |
| UI | Manual pass of the §13.3 script in two windows; keyboard-only pass; reduced-motion on; dark mode | Manual |

---

## 16. Honest limitations and future work

**Known limits of the MVP (say these out loud if asked)**

- The planner is a **heuristic**, not a proven optimum. It is explainable and fast, and it is designed to be replaced by an OR-Tools solver behind the same contract (§8.14).
- Distances, costs, speeds and emission factors are **placeholders**. Pricing claims need real operator data.
- Cargo is **not split** across boats. Trips are **single-direction pairs** (A → B and back), not multi-stop routes.
- Boat movement is **simulated**; there is no GPS/AIS.
- Delay risk is **rule-based**, not learned.
- No payments, contracts, insurance or regulatory workflows (inland vessel registration, hazardous goods, draft and tide limits).
- The cold-start problem is real: backhaul and pooling only work with enough cargo in both directions on a corridor. Pick one corridor first.

**Future work (in rough order of value)**

1. OR-Tools solver service with the same JSON contract and heuristic fallback.
2. Multi-stop routes and cargo splitting.
3. Real routing and distances; draft/depth and tidal restrictions; terminal slot booking.
4. GPS/AIS tracking; a learned ETA and delay model once real trips generate data; demand forecasting per route.
5. Payments, invoicing, digital proof of delivery.
6. Operator mobile app with offline mode (poor connectivity on the water).
7. Multi-tenant operation and integration with the national inland-waterway portal.

---

## Appendix A: how to use this document with an AI coding tool

Give the tool this whole file, then work in small steps. Suggested prompts, in order:

1. *"Read the spec. Create the monorepo structure in §12, the Docker Compose file, and a Prisma schema equivalent to the SQL in §6. Do not write any other code yet."*
2. *"Implement the engine modules in §8 as pure functions with Vitest tests using the seed data in §13. No Express and no database in `engine/`."*
3. *"Implement auth, role middleware and the cargo + quote endpoints from §9.2-9.3, using the engine."*
4. *"Implement `/plans/optimize`, publish, trips accept/decline and the notification service with SSE (§9.5-9.6, §10)."*
5. *"Implement disruptions and recovery plans (§8.11, §9.7)."*
6. *"Build the React app per §11: tokens, materials, motion presets, shell, then the Owner, Operator and Admin screens in the order of §14."*
7. *"Add the dashboard, map, delay watcher, simulator and copilot."*

Rules to tell the tool: keep the engine pure; every number shown to a user comes from the engine; never hard-code demo results; follow the motion and accessibility rules in §11.6 and §11.10; mark any constant that is a guess as `[ASSUMPTION]` and read it from `settings`.
