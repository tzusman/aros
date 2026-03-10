# AROS Dashboard

## Product Requirements Document

**Version:** 1.0
**Date:** March 10, 2026
**Parent PRD:** [AROS Core PRD](./aros-prd.md) (Section 11: Dashboard MVP)

---

## Table of Contents

1. [Purpose](#1-purpose)
2. [Users and Personas](#2-users-and-personas)
3. [Architecture](#3-architecture)
4. [Information Architecture](#4-information-architecture)
5. [Review Workspace](#5-review-workspace)
6. [Folder and Multi-Asset Review](#6-folder-and-multi-asset-review)
7. [Pipeline Monitor](#7-pipeline-monitor)
8. [Policies Manager](#8-policies-manager)
9. [Real-Time Updates](#9-real-time-updates)
10. [Responsive Behavior](#10-responsive-behavior)
11. [Design System](#11-design-system)
12. [Accessibility](#12-accessibility)
13. [MVP Scope](#13-mvp-scope)
14. [Implementation Sequence](#14-implementation-sequence)

---

## 1. Purpose

The AROS Dashboard is the human interface to the Agent Review Orchestration Service. Agents interact with AROS through the filesystem MCP contract. Humans interact through this dashboard.

Two jobs:
1. **Reviewers** review deliverables and make decisions (approve, request revision, reject).
2. **Operators** monitor pipeline health and manage review policies.

The dashboard is self-hosted, open-source, and designed to work out of the box with zero configuration beyond pointing it at an AROS instance.

---

## 2. Users and Personas

### Human Reviewer

Reviews AI-generated content that has passed automated objective and subjective stages. Needs to:
- See what's in their queue
- Read the deliverable alongside the original brief
- Inspect automated review results (objective checks, subjective scores)
- View revision history for resubmitted content
- Make a decision quickly: approve, request revision, or reject with a reason

**Optimized for:** speed and focus. The workspace is designed to minimize context-switching. Queue, content, context, and decision controls are all visible without navigation.

### System Operator

Manages the AROS instance. Needs to:
- See how many deliverables are in each pipeline stage
- Identify stuck or stale items
- Create and modify review policies
- Understand pipeline throughput at a glance

**Optimized for:** visibility. The pipeline monitor shows stage counts and a filterable table of all deliverables.

---

## 3. Architecture

### Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| **Framework** | Vite + React 18 | SPA. Simple deployment — static files + API server. No SSR complexity. Self-hosted operators serve it behind their own reverse proxy. |
| **Styling** | Tailwind CSS | Utility-first. Dark mode via `dark:` variants. No custom CSS framework to maintain. |
| **Components** | shadcn/ui | Copy-paste component library built on Radix primitives. Accessible by default. No dependency lock-in — components live in the project. Customizable for operators who want to theme. |
| **Icons** | Lucide React | Consistent, MIT-licensed, tree-shakeable. |
| **Routing** | React Router | Client-side routing for the SPA. Three routes: `/review`, `/pipeline`, `/policies`. |
| **State** | React Context + useReducer | No external state library for MVP. SSE events dispatch to a reducer. Component state for UI concerns. |
| **Markdown** | react-markdown + rehype-highlight | Render deliverable content with syntax highlighting for code blocks. |

### Communication with AROS Backend

The dashboard does **not** read the filesystem directly. AROS exposes two HTTP interfaces:

**REST API** — for reads and mutations:
- `GET /api/deliverables` — list deliverables with stage filter
- `GET /api/deliverables/:id` — full deliverable with content, review results, feedback, history
- `POST /api/deliverables/:id/decision` — submit human decision (approve/revise/reject + reason)
- `GET /api/policies` — list policies
- `GET /api/policies/:name` — get policy details
- `PUT /api/policies/:name` — create or update policy
- `DELETE /api/policies/:name` — delete policy
- `GET /api/pipeline/counts` — stage counts for pipeline monitor

**SSE endpoint** — for real-time updates:
- `GET /api/events` — server-sent event stream

The REST API is a thin layer over the filesystem. AROS reads/writes files on disk and returns JSON to the dashboard. The filesystem remains the source of truth per the core PRD.

### Authentication

No authentication for MVP. The dashboard is assumed to be deployed behind a VPN, reverse proxy with auth, or on a private network. The operator handles access control at the network layer.

### Deployment

The dashboard builds to static files (`dist/`). Operators can:
- Serve from the AROS process itself (AROS serves both the API and the static files)
- Deploy to any static hosting and point it at the AROS API URL via an environment variable

```
VITE_AROS_API_URL=http://localhost:3000/api
```

---

## 4. Information Architecture

### Navigation Shell

The dashboard has a persistent shell across all views:

**Top bar (44px height):**
- Left: AROS wordmark
- Right: SSE connection status indicator (green/amber/red dot + label), dark/light mode toggle

**Icon rail (56px width, left edge):**
Three icons to switch between the primary views:
1. Document icon → **Review** (default view)
2. Activity icon → **Pipeline**
3. Settings icon → **Policies**

The active view's icon gets a blue highlight and background. The icon rail is always visible on desktop. On mobile it becomes a bottom tab bar.

### Three Views

| View | URL | Primary User | Layout |
|---|---|---|---|
| Review | `/review` | Reviewer | Queue sidebar + content + context panel + decision bar |
| Pipeline | `/pipeline` | Operator | Stage count cards + filterable deliverable table |
| Policies | `/policies` | Operator | Policy list sidebar + policy editor |

---

## 5. Review Workspace

The primary view. A three-panel layout optimized for the review task.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  AROS                                          ● Connected  ◐   │
├────┬────────────┬──────────────────────────────┬─────────────────┤
│    │ Review     │ Q3 Performance Report        │                 │
│ ■  │ Queue [4]  │ Score: 8.2 · exec-report · v2│                 │
│    │ ┌────────┐ ├──────────────────────────────┤ Brief │Obj│Sub│H│
│ ◇  │ │search  │ │                              │                 │
│    │ └────────┘ │  # Q3 2026 Performance       │ Brief: Generate │
│ ⚙  │ Pending|All│  ## Executive Summary        │ a 2000-word     │
│    │            │  The third quarter of 2026    │ quarterly...    │
│    │ ▌Q3 Report │  demonstrated exceptional     │                 │
│    │  8.2 · 2h  │  growth across all key...    │ Audience:       │
│    │            │                              │ Executive       │
│    │  Ad Set    │  ## Revenue Performance       │ leadership      │
│    │  7.4 · 45m │  Subscription revenue grew   │                 │
│    │            │  to $38.1M (+27% YoY)...     │ Tone: Formal,   │
│    │  Blog Post │                              │ data-driven     │
│    │  6.1 · 15m │                              │                 │
├────┴────────────┴──────────────────────────────┴─────────────────┤
│ [Add a reason...                          ] Approve Revise Reject│
└──────────────────────────────────────────────────────────────────┘
```

### Queue Sidebar (260px)

- **Header:** "Review Queue" label + badge count of pending items
- **Search:** text input to filter deliverables by title or agent name
- **Filter tabs:** Pending (default) | All | Revisions (deliverables on v2+ that are back in human review after a revision cycle)
- **Queue items:** each shows:
  - Deliverable title (truncated to one line)
  - Source agent name
  - AI subjective score (color-coded: green ≥ 7, amber 6–7, red < 6)
  - Time in queue (relative: "2h", "45m", "5m")
  - Folder badge if applicable ("folder · 4 files")
- **Selected item:** highlighted background + blue left border
- **Sorting:** oldest first by default (longest-waiting gets reviewed first)
- **Collapsible:** keyboard shortcut `[` toggles the sidebar. Collapsed state persists to `localStorage`.

**Simplification from core PRD:** The core PRD (Section 11.1) specifies queue columns including content type, priority, assigned reviewer, and objective result summary. The sidebar format is intentionally compact — it shows only what a reviewer needs to triage (title, agent, score, wait time). Full details (content type, policy, objective results, revision count) are visible in the content header and context panel after selecting a deliverable. Priority and reviewer assignment (round-robin, multi-reviewer consensus) are deferred past MVP — all deliverables share a single queue with no assignment.

### Content Area (fluid width)

- Rendered deliverable content
- Markdown rendered via react-markdown with syntax highlighting
- Max content width: 720px for optimal reading line length
- Content scrolls independently of the sidebar and context panel

### Context Panel (300px, right side)

Four tabs:
1. **Brief** — the original production instructions from `brief.md`. Shows target audience, tone, required sections, and any reference materials.
2. **Objective** — results of automated checks. Each check listed with pass/fail/warning status, expandable for details. Failed checks highlighted.
3. **Subjective** — per-criterion scores from the AI reviewer. Score, weight, and written rationale for each criterion. Overall weighted score at the top.
4. **History** — revision history. Shows version number, a text summary of what changed (computed by the REST API from the version files, not a rendered diff), and the feedback that prompted each revision. Only visible for deliverables with revisions (v2+).

**Collapsible:** keyboard shortcut `]` toggles the context panel.

### Decision Bar (fixed bottom)

- **Reason field:** text input, full width minus buttons. Placeholder: "Add a reason (required for Revise/Reject)...". Reason is optional for Approve, required for Revise and Reject.
- **Three action buttons:**
  - **Approve** (green, primary prominence): submits `"decision": "approved"`
  - **Revise** (amber, outlined): submits `"decision": "revision_requested"` + reason
  - **Reject** (red, outlined): submits `"decision": "rejected"` + reason
- **Decision payload (MVP):** `POST /api/deliverables/:id/decision` accepts `{ decision: "approved" | "revision_requested" | "rejected", reason?: string }`. The `annotations` array from the core PRD's `decision.json` schema is omitted from the MVP — the free-text reason field is the only feedback mechanism. The REST API writes the `decision.json` file to disk on behalf of the reviewer.
- Revise and Reject buttons are disabled when reason field is empty
- After decision, the deliverable is removed from the queue and the next item in the queue auto-selects
- Confirmation is instant — no modal. Decisions are final (undo is a future feature).

### Error Handling

- **Decision submission failure:** if the POST returns an error (4xx or 5xx), a toast notification appears at the top of the content area with the error message. The decision buttons re-enable. The deliverable stays in the queue.
- **Stale state (409 Conflict):** if another reviewer has already decided on this deliverable, a toast notifies the reviewer and removes the item from the queue.
- **Network failure:** if the request fails to send, a toast with "Network error — check connection" appears. The SSE connection indicator in the top bar will likely already show amber/red.

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `[` | Toggle queue sidebar |
| `]` | Toggle context panel |
| `j` / `k` | Next / previous deliverable in queue |
| `1` / `2` / `3` / `4` | Switch context panel tab (Brief / Objective / Subjective / History) |

---

## 6. Folder and Multi-Asset Review

When a deliverable is a folder (multiple files), the content area adapts based on content type.

### Image Folders — Grid View

For folders containing images, the content area switches to a responsive grid:

```
┌──────────────────────────────────────────────────┐
│ Q3 Ad Campaign Creatives                         │
│ Folder · 4 files · creative-gen-01  [Grid|Single]│
├──────────────────────────────────────────────────┤
│ ┌──────────────┐  ┌──────────────┐               │
│ │              │  │  ██████████  │ ← blue border │
│ │   Variant A  │  │  Variant B   │   = inspecting│
│ │              │  │  ██████████  │               │
│ │         7.1  │  │         8.4  │               │
│ └──────────────┘  └──────────────┘               │
│ ┌──────────────┐  ┌──────────────┐               │
│ │              │  │              │               │
│ │   Variant C  │  │  Variant D   │               │
│ │              │  │              │               │
│ │         5.3  │  │         7.9  │               │
│ └──────────────┘  └──────────────┘               │
└──────────────────────────────────────────────────┘
```

- **Grid layout:** 2 columns, responsive to available width
- **Each card shows:** image thumbnail, filename, individual subjective score
- **Click to inspect:** clicking an image highlights it (blue border) and loads its individual scores and AI rationale in the context panel
- **Grid/Single toggle:** switch between grid overview and single full-size image view with arrow key navigation between images
- **Decision applies to the whole folder:** standard Approve / Revise / Reject buttons. Reviewer writes a reason like "Update copy on all variants to match new tagline" to revise the set.

### Text/Code Folders

For folders containing text or code files (implementation + tests + docs), a horizontal file tab strip replaces the grid:
- Tab bar showing filenames with extension (e.g., `auth.ts`, `auth.test.ts`, `auth.md`)
- Click a tab to view that file's content rendered in the content area
- Each tab shows a pass/fail dot indicator (green check or red X)
- Context panel shows per-file review results for the focused file
- Tab strip scrolls horizontally if there are more tabs than fit; a scroll indicator appears at the right edge
- Maximum practical limit: ~15 files. Folders with more files show a condensed file list instead of tabs.
- Decision applies to the whole folder, same as image folders

### Selection Mode (Post-MVP, Folder Strategy: `select`)

Selection mode is **deferred past MVP**. The grid view ships for all image folders, but the selection-specific affordances below are future work. This section documents the planned design for when `select` strategy support is added.

When a folder's strategy is `select`, the grid view gains selection affordances:

- **Selection header:** "Select N of M eligible variants" with a counter showing current selection count
- **Checkboxes** appear on each image card — click to toggle selection
- **Ineligible items** (failed review) are dimmed at 50% opacity, unclickable, with a red X badge
- **AI recommendation banner** appears above the grid showing the AI's comparative ranking and pick rationale
- **AI rank badges** on recommended images ("#1 AI Pick", "#2 AI Pick")
- **Decision bar changes:** "Confirm Selection" button (disabled until required count met) replaces "Approve". "Request More" button lets the reviewer ask for additional variants.
- **Selection rationale field** replaces the reason field — optional text explaining why these were chosen
- **REST endpoint:** a separate `POST /api/deliverables/:id/selection` endpoint accepting `{ selected: string[], rationale?: string }` that writes `selection/decision.json` to disk

---

## 7. Pipeline Monitor

The operator's view of pipeline health. No vanity KPIs — every number is an actionable count of items in a specific state.

**Deviation from core PRD:** The core PRD (Section 11.6) specifies a "simple status table with refresh" for MVP. This dashboard intentionally upgrades to SSE-driven live counts because the SSE infrastructure is already required for the review queue, and applying it to the pipeline monitor is marginal additional work. The core PRD's analytics view (Section 11.4 — pass/fail rates, revision cycle distribution, reviewer throughput) is deferred past MVP. The pipeline monitor's stage counts are the "basic counts" referenced in the core PRD's MVP scope reduction.

**Auto-approved deliverables** (those that bypassed human review via auto-approval rules) appear in the Approved count and table like any other approved item. The table's Stage column shows "Auto-approved" instead of a stage pill. No separate view for auto-approved items in MVP.

### Stage Count Cards

Five cards displayed horizontally, each acting as both a summary and a filter:

| Card | What it counts | Color | Window |
|---|---|---|---|
| **In Progress** | Deliverables in objective or subjective review (combined — both are automated stages the operator cannot act on) | Blue | Current |
| **Pending Human** | Deliverables awaiting human review | Amber | Current |
| **Awaiting Revisions** | Sent back to agents, waiting for resubmission | Orange | Current |
| **Approved** | Terminal approved state (includes auto-approved) | Green | Last 72 hours |
| **Rejected** | Terminal rejected state | Red | Last 72 hours |

- Clicking a card filters the table below to that stage
- Selected card gets a blue border
- Counts update in real-time via SSE
- The "In Progress" card aggregates objective and subjective stages because the operator cannot act on either — they are automated. The table below splits them into separate stage pills (Objective / Subjective) for drill-down visibility.

### Deliverable Table

Filtered by the selected stage card. Columns:

| Column | Content |
|---|---|
| Deliverable | Title + folder badge if applicable |
| Stage | Color-coded pill (Objective / Subjective / Human / Revising) |
| Policy | Policy name |
| Agent | Source agent identifier |
| Entered | Time since entering current stage (relative) |

- Click any row to jump into that deliverable's review workspace
- Sortable by any column
- Default sort: oldest first (longest time in current stage)

---

## 8. Policies Manager

Same sidebar-content layout pattern as the review workspace.

### Policy List Sidebar

- List of all policies by name
- Each entry shows: policy name, number of stages, max revisions
- "+" button to create a new policy
- Selected policy highlighted with blue left border

### Policy Editor

Displays the selected policy in a structured, readable format:

**Pipeline visualization** at the top showing the stage flow as connected cards:
```
[1. Objective] → [2. Subjective] → [3. Human]
   4 checks       4 criteria          1 reviewer
                   threshold 7.0      24h SLA
```

**Settings cards** in a 2-column grid:

1. **Objective Checks** — list of configured checks with name and severity (blocking/warning)
2. **Subjective Criteria** — list of criteria with weights and pass threshold
3. **Human Review** — assignment strategy, required reviewers, SLA hours
4. **Revision Settings** — max revisions, mode (auto/hybrid/manual), restart behavior
5. **Notifications** — default driver, target, subscribed events

The structured editor covers the most commonly edited policy fields. Fields not shown in the structured view — bypass/auto-approval rules, action hooks (on_approval, on_rejection, on_revision_requested), escalation rules, and per-file policy overrides — are accessible via the "View JSON" toggle. The JSON editor shows the complete policy file.

**Actions:**
- "Save" button (primary) — writes the policy JSON to disk
- "View JSON" toggle — switches between structured card view and raw JSON editor for power users. Changes in either view are synced.
- New policies start from a template (copy of `default.json`)

---

## 9. Real-Time Updates

### SSE Event Stream

The dashboard subscribes to `GET /api/events` on load. Event types:

| Event | Payload | Dashboard Effect |
|---|---|---|
| `deliverable:submitted` | `{ id, title, policy, agent }` | Increment pipeline count. If stage is human, add to review queue. |
| `deliverable:stage_changed` | `{ id, from_stage, to_stage }` | Update pipeline counts. If moved to human, add to review queue with notification. |
| `deliverable:decided` | `{ id, decision, stage }` | Remove from review queue. Update pipeline counts. |
| `deliverable:revised` | `{ id, revision_number }` | Update pipeline counts. If deliverable was visible, refresh its data. |

### Connection Health

The top bar shows connection status:
- **Green dot + "Connected"** — SSE stream active, receiving heartbeats
- **Amber dot + "Reconnecting"** — connection lost, automatic reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- **Red dot + "Disconnected"** — reconnect failed after sustained period. Manual "Retry" link.

SSE heartbeat: AROS sends a `:heartbeat` comment every 30 seconds. If no heartbeat received within 60 seconds, the dashboard initiates reconnect.

### Browser Notifications

On `deliverable:stage_changed` to `human` stage, the dashboard fires a browser notification if the tab is not focused:

```
Title: "New review: Q3 Performance Report"
Body: "From report-gen-01 · Policy: executive-report · Score: 7.2"
```

Requires user permission via the Notifications API. Permission requested on first visit, not on page load.

**Deviation from core PRD:** The core PRD (Section 12) specifies a Service Worker for browser notifications. The dashboard uses the simpler Notifications API instead, which requires the tab to be open (though it can be unfocused). Service Worker-based push notifications — which work even when the tab is closed — are deferred to the PWA upgrade path described in the core PRD's Section 12.2.

---

## 10. Responsive Behavior

### Desktop (≥ 1024px)

Full workspace layout: icon rail + queue sidebar + content area + context panel. All panels visible simultaneously.

### Tablet (768–1023px)

- Icon rail remains
- Queue sidebar becomes a slide-over panel triggered by tapping the review icon in the rail
- Content area takes full width
- Context panel collapses to a bottom sheet (swipe up to expand, swipe down to collapse)
- Decision bar remains fixed at bottom

### Mobile (< 768px)

- Icon rail becomes a bottom tab bar (3 tabs: Review, Pipeline, Policies)
- Review view: queue list is the primary screen. Tap a deliverable to open it full-screen.
- Content renders full-width with collapsible context section above the decision bar
- Context tabs become a horizontal scrollable tab bar above the content
- Decision bar is a fixed bottom sheet
- Pipeline view: stage count cards stack vertically, table scrolls horizontally
- Policies view: list is the primary screen, tap to open editor full-screen

### Keyboard Shortcuts

Shortcuts are desktop-only. On touch devices, all interactions are tap/swipe.

### Panel Persistence

Collapsed/expanded state of the queue sidebar and context panel is persisted to `localStorage` per breakpoint. A user who collapses the context panel on desktop won't have it collapsed if they resize to tablet (different layout).

---

## 11. Design System

### Colors

**Base palette (Slate):**

| Token | Light | Dark | Usage |
|---|---|---|---|
| `background` | `#ffffff` | `#0f172a` | Page background |
| `surface` | `#f8fafc` | `#1e293b` | Cards, panels, sidebar |
| `border` | `#e2e8f0` | `#334155` | Dividers, card borders |
| `text-primary` | `#0f172a` | `#e2e8f0` | Headings, primary text |
| `text-secondary` | `#475569` | `#94a3b8` | Body text, descriptions |
| `text-muted` | `#94a3b8` | `#64748b` | Timestamps, labels |

**Stage colors (consistent across light and dark):**

| Stage | Color | Hex | Usage |
|---|---|---|---|
| Objective | Blue | `#3b82f6` | Stage pills, progress indicators |
| Subjective | Purple | `#8b5cf6` | Stage pills, progress indicators |
| Human / Pending | Amber | `#fbbf24` | Stage pills, queue indicators |
| Approved / Pass | Green | `#22c55e` | Decision buttons, score badges, status |
| Rejected / Fail | Red | `#ef4444` | Decision buttons, error states |
| Revising | Orange | `#f97316` | Stage pills, warning badges (note: shifted from `#f59e0b` to `#f97316` to increase contrast against the Amber `#fbbf24` used for Human/Pending) |
| Active / Selected | Sky Blue | `#38bdf8` | Selected items, active tabs, focus rings |

### Typography

| Element | Font | Size | Weight |
|---|---|---|---|
| UI text | Inter (system fallback: `-apple-system, sans-serif`) | 13–14px | 400–600 |
| Headings | Inter | 15–18px | 600–700 |
| Labels / badges | Inter | 9–10px | 500–600 |
| Deliverable content | System serif or sans (per content type) | 15px | 400 |
| Code content | `ui-monospace, monospace` | 13px | 400 |
| Deliverable IDs | Monospace | 11px | 400 |

**Line height:** 1.5–1.7 for body text. 1.3 for headings. Max content line length: 720px (45–75 characters).

### Icons

Lucide React. 24x24 viewBox, rendered at 16–18px in the icon rail and 12–14px inline. Stroke width 2.

### Component Library

shadcn/ui primitives, configured for the project. Key components:

- **Button** — three variants: primary (filled), outline, ghost
- **Input** — text inputs, search fields
- **Tabs** — context panel tabs, filter tabs
- **Badge** — stage pills, score indicators
- **Card** — policy settings cards, stage count cards, image grid cards
- **ScrollArea** — queue sidebar, content area, context panel (independent scroll)
- **Tooltip** — icon rail labels, truncated text
- **Dialog** — confirmation dialogs (if needed in future)

### Dark / Light Mode

- Default: follows `prefers-color-scheme` system preference
- Override: toggle in the top bar persists choice to `localStorage`
- Implementation: Tailwind `dark:` class strategy. The `<html>` element gets `class="dark"` when dark mode is active.
- All color tokens must work in both modes. Use semantic tokens (`bg-surface`, `text-primary`) not raw hex values.

### Spacing and Layout

- Icon rail: 56px wide
- Queue sidebar: 260px wide (collapsible)
- Context panel: 300px wide (collapsible)
- Content area: fluid, content max-width 720px centered
- Top bar: 44px height
- Decision bar: 52px height
- Card padding: 12–16px
- Grid gap: 8–12px
- Border radius: 6px (small elements), 8px (cards), 10px (image cards)

---

## 12. Accessibility

### Requirements (WCAG 2.1 AA)

- **Color contrast:** minimum 4.5:1 for normal text, 3:1 for large text and UI components. All stage colors verified against both light and dark backgrounds.
- **Focus states:** visible focus ring (2px `#38bdf8` outline with 2px offset) on all interactive elements. Focus order matches visual order.
- **Keyboard navigation:** all functionality accessible via keyboard. Tab order: icon rail → queue sidebar → content → context panel → decision bar.
- **Screen reader support:** semantic HTML (`nav`, `main`, `aside`, `header`). ARIA labels on icon-only buttons. Live regions (`aria-live="polite"`) for SSE-driven count updates and queue additions.
- **Reduced motion:** respect `prefers-reduced-motion`. Disable transitions and animations when set.
- **Form labels:** all inputs have associated labels (visually hidden where the placeholder serves as the visible label).
- **Image alt text:** deliverable images in folder review get filenames as alt text. Score badges use `aria-label` with the full score value.

---

## 13. MVP Scope

### Included

- Review workspace with queue sidebar, content rendering (markdown + code highlighting), context panel (Brief, Objective, Subjective, History tabs), and decision bar
- Folder review with image grid view, single-image view toggle, and per-file score inspection
- Pipeline monitor with stage count cards and filterable deliverable table
- Policies manager with list + structured editor + raw JSON toggle
- SSE real-time updates for queue and pipeline counts
- Browser notifications for new human review items
- Dark/light mode with system preference detection
- Responsive layout (desktop, tablet, mobile)
- Keyboard shortcuts for desktop review workflow

### Deferred Past MVP

- Authentication and user management
- Selection mode for `select` folder strategy (grid view ships, selection checkboxes do not)
- `rank` and `categorize` folder strategy views
- Inline content annotations (highlights and comments on specific text)
- Multi-reviewer consensus workflows
- Undo/revert decisions
- Analytics beyond pipeline stage counts
- Policy test mode (dry-run a policy against sample content)
- Mobile PWA / native push notifications
- Full-text search across all deliverables
- Batch actions (approve/reject multiple deliverables)
- Customizable queue sorting and saved filters
- Dashboard theming beyond dark/light (custom brand colors)

---

## 14. Implementation Sequence

| Step | Deliverable | Dependency |
|---|---|---|
| 1 | **Project scaffold:** Vite + React + Tailwind + shadcn/ui + React Router. Three empty route shells (`/review`, `/pipeline`, `/policies`). Icon rail navigation. Dark/light mode toggle. | None |
| 2 | **REST API client:** typed API client for all AROS REST endpoints. Mock data layer for development before AROS backend is ready. | Step 1 |
| 3 | **Review workspace — content area:** markdown rendering with syntax highlighting. Content header with title, score badge, policy, version. Scrollable content with 720px max-width. | Step 2 |
| 4 | **Review workspace — queue sidebar:** deliverable list with search, filters (Pending/All/Revisions), score badges, time-in-queue. Item selection. Collapsible. | Step 2 |
| 5 | **Review workspace — context panel:** four tabs (Brief, Objective, Subjective, History). Score display with color coding. Rationale text. Collapsible. | Step 2 |
| 6 | **Review workspace — decision bar:** reason text field + Approve/Revise/Reject buttons. POST to decision endpoint. Auto-advance to next queue item. Keyboard shortcuts. | Steps 3–5 |
| 7 | **SSE integration:** connect to event stream, update queue and pipeline state in real-time. Connection health indicator. Reconnect with backoff. Browser notifications. | Step 6 |
| 8 | **Pipeline monitor:** stage count cards, filtered deliverable table, click-to-navigate to review workspace. | Step 7 |
| 9 | **Folder review — grid view:** image grid, click-to-inspect, Grid/Single toggle, per-file scores in context panel. | Step 6 |
| 10 | **Policies manager:** policy list sidebar, structured editor with pipeline visualization and settings cards, raw JSON toggle, save. | Step 2 |
| 11 | **Responsive layout:** tablet slide-over sidebar + bottom sheet context. Mobile bottom tab bar + full-screen views. | Steps 6–10 |

Steps 1–6 deliver a functional review workflow. Step 7 adds real-time updates. Steps 8–10 add operator features. Step 11 handles responsive. The dashboard is usable for human review after step 6.
