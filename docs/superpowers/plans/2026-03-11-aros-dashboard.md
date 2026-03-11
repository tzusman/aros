# AROS Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AROS Dashboard — a self-hosted, workspace-centric review UI for human reviewers and system operators.

**Architecture:** Vite + React 18 SPA with Tailwind CSS and shadcn/ui components. Communicates with AROS backend via REST API + SSE. No authentication for MVP. Mock data layer enables frontend development before backend is ready.

**Tech Stack:** Vite, React 18, TypeScript, Tailwind CSS, shadcn/ui (Radix primitives), React Router, Lucide React icons, react-markdown + rehype-highlight

**Spec:** `docs/prds/aros-dashboard-prd.md`

---

## File Structure

```
dashboard/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── components.json                    # shadcn/ui config
├── .env.example
├── src/
│   ├── main.tsx                       # React root + router
│   ├── App.tsx                        # Router + AppProvider + Layout
│   ├── index.css                      # Tailwind directives + CSS vars
│   ├── lib/
│   │   ├── utils.ts                   # cn() helper
│   │   ├── api/
│   │   │   ├── client.ts             # REST API client (typed fetch wrapper)
│   │   │   ├── types.ts              # Shared TypeScript types for all API responses
│   │   │   ├── mock-data.ts          # Realistic mock deliverables, policies, counts
│   │   │   └── sse.ts                # SSE connection manager with reconnect
│   │   └── hooks/
│   │       ├── use-theme.ts          # Dark/light mode (prefers-color-scheme + localStorage)
│   │       ├── use-keyboard.ts       # Global keyboard shortcut registration
│   │       ├── use-panel-state.ts    # Collapsible panel state persisted to localStorage
│   │       └── use-relative-time.ts  # "2h ago" formatting with auto-refresh
│   ├── context/
│   │   ├── app-context.tsx           # React Context provider wrapping useReducer
│   │   └── app-reducer.ts           # Reducer: deliverables, queue, pipeline counts, connection
│   ├── components/
│   │   ├── ui/                       # shadcn/ui components (generated via CLI)
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── card.tsx
│   │   │   ├── scroll-area.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── tooltip.tsx
│   │   │   └── sonner.tsx            # Toast via sonner
│   │   ├── shell/
│   │   │   ├── top-bar.tsx           # AROS wordmark + connection dot + theme toggle
│   │   │   ├── icon-rail.tsx         # 56px left nav, 3 view icons
│   │   │   └── layout.tsx            # Shell: top-bar + icon-rail + <Outlet />
│   │   ├── review/
│   │   │   ├── queue-sidebar.tsx     # 260px sidebar: search, filter tabs, deliverable list
│   │   │   ├── queue-item.tsx        # Single item: title, agent, score badge, time
│   │   │   ├── content-header.tsx    # Title + score + policy + version badges
│   │   │   ├── content-area.tsx      # Markdown rendering with react-markdown
│   │   │   ├── context-panel.tsx     # 300px right panel with 4 tabs
│   │   │   ├── brief-tab.tsx         # Brief tab content
│   │   │   ├── objective-tab.tsx     # Objective checks list (pass/fail/warning)
│   │   │   ├── subjective-tab.tsx    # Per-criterion scores + rationale
│   │   │   ├── history-tab.tsx       # Revision history list
│   │   │   ├── decision-bar.tsx      # Fixed bottom: reason input + 3 buttons
│   │   │   └── score-badge.tsx       # Color-coded score display (green/amber/red)
│   │   ├── folder/
│   │   │   ├── image-grid.tsx        # 2-column grid of image cards
│   │   │   ├── image-card.tsx        # Thumbnail + filename + score
│   │   │   ├── single-image-view.tsx # Full-size image with arrow navigation
│   │   │   └── file-tabs.tsx         # Horizontal tab strip for text/code folders
│   │   ├── pipeline/
│   │   │   ├── stage-cards.tsx       # Horizontal row of 5 count cards
│   │   │   ├── stage-card.tsx        # Single count card (clickable filter)
│   │   │   └── deliverable-table.tsx # Sortable table with stage pills
│   │   └── policies/
│   │       ├── policy-list.tsx       # Sidebar list + "+" button
│   │       ├── policy-editor.tsx     # Structured editor with settings cards
│   │       ├── pipeline-flow.tsx     # Stage flow visualization (connected cards)
│   │       ├── settings-card.tsx     # Generic card for objective/subjective/etc
│   │       └── json-editor.tsx       # Raw JSON textarea with syntax formatting
│   └── pages/
│       ├── review-page.tsx           # Composes queue + content + context + decision
│       ├── pipeline-page.tsx         # Composes stage cards + table
│       └── policies-page.tsx         # Composes policy list + editor
```

---

## Chunk 1: Foundation

### Task 1: Project Scaffold

**Files:**
- Create: `dashboard/package.json`
- Create: `dashboard/index.html`
- Create: `dashboard/vite.config.ts`
- Create: `dashboard/tsconfig.json`
- Create: `dashboard/tsconfig.node.json`
- Create: `dashboard/postcss.config.js`
- Create: `dashboard/tailwind.config.ts`
- Create: `dashboard/components.json`
- Create: `dashboard/.env.example`
- Create: `dashboard/src/main.tsx`
- Create: `dashboard/src/index.css`
- Create: `dashboard/src/App.tsx`
- Create: `dashboard/src/lib/utils.ts`

- [ ] **Step 1: Create dashboard directory and initialize project**

```bash
mkdir -p dashboard
cd dashboard
npm create vite@latest . -- --template react-ts
```

The `--template react-ts` flag makes this non-interactive. This generates `package.json`, `index.html`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, and `src/` scaffolding.

- [ ] **Step 2: Install dependencies**

```bash
cd dashboard
npm install react-router-dom lucide-react react-markdown rehype-highlight sonner class-variance-authority clsx tailwind-merge
npm install -D tailwindcss @tailwindcss/typography postcss autoprefixer @types/node
npx tailwindcss init -p --ts
```

- [ ] **Step 3: Configure Tailwind with design system tokens**

Write `dashboard/tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        surface: "hsl(var(--surface))",
        border: "hsl(var(--border))",
        "text-primary": "hsl(var(--text-primary))",
        "text-secondary": "hsl(var(--text-secondary))",
        "text-muted": "hsl(var(--text-muted))",
        stage: {
          objective: "#3b82f6",
          subjective: "#8b5cf6",
          human: "#fbbf24",
          approved: "#22c55e",
          rejected: "#ef4444",
          revising: "#f97316",
        },
        active: "#38bdf8",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      maxWidth: {
        content: "720px",
      },
      width: {
        rail: "56px",
        queue: "260px",
        context: "300px",
      },
      height: {
        topbar: "44px",
        decision: "52px",
      },
    },
  },
  plugins: [typography],
} satisfies Config;
```

- [ ] **Step 4: Write CSS with design system variables**

Write `dashboard/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --surface: 210 40% 98%;
    --border: 214 32% 91%;
    --text-primary: 222 47% 11%;
    --text-secondary: 215 16% 47%;
    --text-muted: 215 16% 65%;
  }

  .dark {
    --background: 222 47% 11%;
    --surface: 217 33% 17%;
    --border: 215 19% 35%;
    --text-primary: 210 40% 92%;
    --text-secondary: 215 16% 65%;
    --text-muted: 215 16% 47%;
  }

  body {
    @apply bg-background text-text-primary font-sans antialiased;
  }
}
```

- [ ] **Step 5: Write the cn() utility**

Write `dashboard/src/lib/utils.ts`:

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 6: Write App.tsx with router and placeholder pages**

Write `dashboard/src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

function ReviewPage() {
  return <div className="p-4">Review Workspace</div>;
}

function PipelinePage() {
  return <div className="p-4">Pipeline Monitor</div>;
}

function PoliciesPage() {
  return <div className="p-4">Policies Manager</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/review" replace />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/pipeline" element={<PipelinePage />} />
        <Route path="/policies" element={<PoliciesPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 7: Write main.tsx**

Write `dashboard/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 8: Write .env.example**

Write `dashboard/.env.example`:

```
VITE_AROS_API_URL=http://localhost:3000/api
```

- [ ] **Step 9: Configure shadcn/ui**

```bash
cd dashboard
npx shadcn@latest init --defaults --yes
```

If the `--defaults` flag is not supported, write `dashboard/components.json` manually:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

Ensure `tsconfig.json` has path aliases: `"@/*": ["./src/*"]`.

- [ ] **Step 10: Install shadcn/ui components**

```bash
cd dashboard
npx shadcn@latest add button input badge card scroll-area tabs tooltip sonner
```

- [ ] **Step 11: Verify the app starts**

```bash
cd dashboard
npm run dev
```

Expected: Vite dev server starts at http://localhost:5173. Navigating to `/` redirects to `/review`. Three placeholder pages render.

- [ ] **Step 12: Commit**

```bash
git add dashboard/
git commit -m "feat(dashboard): scaffold Vite + React + Tailwind + shadcn/ui project"
```

---

### Task 2: TypeScript Types

**Files:**
- Create: `dashboard/src/lib/api/types.ts`

- [ ] **Step 1: Write shared types matching the REST API contract**

Write `dashboard/src/lib/api/types.ts`:

```typescript
// --- Deliverable ---

export type Stage =
  | "inbox"
  | "objective"
  | "subjective"
  | "human"
  | "revision_requested"
  | "approved"
  | "auto_approved"
  | "rejected";

export type Decision = "approved" | "revision_requested" | "rejected";

export interface ObjectiveCheck {
  name: string;
  passed: boolean;
  severity: "blocking" | "warning";
  details: string;
}

export interface SubjectiveCriterion {
  name: string;
  score: number;
  weight: number;
  scale: number;
  rationale: string;
}

export interface FeedbackIssue {
  category: string;
  description: string;
  location: string;
  severity: "critical" | "major" | "minor";
  suggestion: string;
}

export interface Feedback {
  stage: string;
  decision: Decision;
  summary: string;
  issues: FeedbackIssue[];
  reviewer: string;
  timestamp: string;
}

export interface RevisionEntry {
  version: number;
  summary: string;
  feedback: Feedback | null;
  timestamp: string;
}

export interface DeliverableFile {
  filename: string;
  content_type: string;
  objective_results: ObjectiveCheck[] | null;
  subjective_results: SubjectiveCriterion[] | null;
  score: number | null;
  status: "passed" | "failed" | "revision_requested" | null;
}

export interface DeliverableSummary {
  id: string;
  title: string;
  source_agent: string;
  policy: string;
  content_type: string;
  stage: Stage;
  score: number | null;
  entered_stage_at: string;
  submitted_at: string;
  revision_number: number;
  is_folder: boolean;
  file_count: number | null;
}

export interface Deliverable extends DeliverableSummary {
  content: string;
  brief: string;
  objective_results: ObjectiveCheck[] | null;
  subjective_results: SubjectiveCriterion[] | null;
  feedback: Feedback | null;
  history: RevisionEntry[];
  files: DeliverableFile[] | null;
  folder_strategy: "all_pass" | "select" | "rank" | "categorize" | null;
}

export interface DecisionPayload {
  decision: Decision;
  reason?: string;
}

// --- Pipeline ---

export interface PipelineCounts {
  in_progress: number;
  pending_human: number;
  awaiting_revisions: number;
  approved_72h: number;
  rejected_72h: number;
}

// --- Policy ---

export interface PolicyObjectiveCheck {
  type?: string;
  module?: string;
  version?: string;
  config: Record<string, unknown>;
  severity: "blocking" | "warning";
}

export interface PolicySubjectiveCriterion {
  name: string;
  description: string;
  weight: number;
  scale: number;
}

export interface PolicyHumanConfig {
  assignment_strategy: string;
  required_reviewers: number;
  consensus_rule: string;
  sla_hours: number;
  show_ai_reviews: boolean;
}

export interface PolicySummary {
  name: string;
  stages: string[];
  max_revisions: number;
}

export interface Policy extends PolicySummary {
  objective: {
    checks: PolicyObjectiveCheck[];
    fail_threshold: number;
  };
  subjective: {
    evaluation_model: string;
    criteria: PolicySubjectiveCriterion[];
    pass_threshold: number;
    require_rationale: boolean;
  };
  human: PolicyHumanConfig;
  revision_handling: {
    mode: "auto_revise" | "hybrid" | "manual";
    max_auto_revisions?: number;
    escalate_after_auto_fail?: boolean;
  };
  default_notifications: Array<{
    driver: string;
    target: Record<string, unknown>;
    events: string[];
  }>;
  raw_json: string;
}

// --- SSE Events ---

export type SSEEventType =
  | "deliverable:submitted"
  | "deliverable:stage_changed"
  | "deliverable:decided"
  | "deliverable:revised";

export interface SSEEvent {
  type: SSEEventType;
  data: Record<string, unknown>;
}

// --- Connection ---

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/lib/api/types.ts
git commit -m "feat(dashboard): add TypeScript types for API contract"
```

---

### Task 3: REST API Client + Mock Data

**Files:**
- Create: `dashboard/src/lib/api/client.ts`
- Create: `dashboard/src/lib/api/mock-data.ts`

- [ ] **Step 1: Write the REST API client**

Write `dashboard/src/lib/api/client.ts`:

```typescript
import type {
  Deliverable,
  DeliverableSummary,
  DecisionPayload,
  PipelineCounts,
  Policy,
  PolicySummary,
} from "./types";
import { mockApi } from "./mock-data";

const API_URL = import.meta.env.VITE_AROS_API_URL || "";
const USE_MOCK = !API_URL;

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const api = {
  async listDeliverables(
    stage?: string
  ): Promise<DeliverableSummary[]> {
    if (USE_MOCK) return mockApi.listDeliverables(stage);
    const params = stage ? `?stage=${stage}` : "";
    return fetchJson(`/deliverables${params}`);
  },

  async getDeliverable(id: string): Promise<Deliverable> {
    if (USE_MOCK) return mockApi.getDeliverable(id);
    return fetchJson(`/deliverables/${id}`);
  },

  async submitDecision(
    id: string,
    payload: DecisionPayload
  ): Promise<void> {
    if (USE_MOCK) return mockApi.submitDecision(id, payload);
    await fetchJson(`/deliverables/${id}/decision`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getPipelineCounts(): Promise<PipelineCounts> {
    if (USE_MOCK) return mockApi.getPipelineCounts();
    return fetchJson("/pipeline/counts");
  },

  async listPolicies(): Promise<PolicySummary[]> {
    if (USE_MOCK) return mockApi.listPolicies();
    return fetchJson("/policies");
  },

  async getPolicy(name: string): Promise<Policy> {
    if (USE_MOCK) return mockApi.getPolicy(name);
    return fetchJson(`/policies/${name}`);
  },

  async savePolicy(
    name: string,
    policy: Policy
  ): Promise<void> {
    if (USE_MOCK) return mockApi.savePolicy(name, policy);
    await fetchJson(`/policies/${name}`, {
      method: "PUT",
      body: JSON.stringify(policy),
    });
  },

  async deletePolicy(name: string): Promise<void> {
    if (USE_MOCK) return mockApi.deletePolicy(name);
    await fetchJson(`/policies/${name}`, { method: "DELETE" });
  },
};
```

- [ ] **Step 2: Write mock data with realistic deliverables and policies**

Write `dashboard/src/lib/api/mock-data.ts`. This file should contain:

- 5-6 mock `DeliverableSummary` entries across different stages (2 in human, 1 in subjective, 1 in objective, 1 approved, 1 in revision)
- 2-3 full `Deliverable` objects with content (short markdown), brief, objective results, subjective scores, and one with revision history
- 1 folder deliverable with 4 image files
- Pipeline counts matching the mock deliverables
- 3-4 mock policies (default, blog-post, code-review, ad-creative-review)

The mock API should implement all methods from `client.ts` with simulated 100ms delays via `setTimeout`.

Key mock data requirements:
- Deliverable IDs follow the pattern `d-20260310-001`
- Scores range from 5.3 to 8.4
- At least one deliverable should be v2 (has revision history)
- Folder deliverable should have `is_folder: true`, `file_count: 4`, `folder_strategy: "all_pass"`
- Mock `submitDecision` should remove the item from the mock queue

- [ ] **Step 3: Verify mock client works**

```bash
cd dashboard
npx tsc --noEmit
```

Expected: no type errors. The mock client will be functionally verified when the app shell renders in Task 4.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/lib/api/
git commit -m "feat(dashboard): add REST API client with mock data layer"
```

---

### Task 4: App Shell (Top Bar + Icon Rail + Layout)

**Files:**
- Create: `dashboard/src/lib/hooks/use-theme.ts`
- Create: `dashboard/src/components/shell/top-bar.tsx`
- Create: `dashboard/src/components/shell/icon-rail.tsx`
- Create: `dashboard/src/components/shell/layout.tsx`
- Modify: `dashboard/src/App.tsx`

- [ ] **Step 1: Write the theme hook**

Write `dashboard/src/lib/hooks/use-theme.ts`:

```typescript
import { useState, useEffect } from "react";

type Theme = "light" | "dark" | "system";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem("aros-theme") as Theme | null;
    return stored || "system";
  });

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function apply() {
      const isDark =
        theme === "dark" || (theme === "system" && mediaQuery.matches);
      root.classList.toggle("dark", isDark);
    }

    apply();
    mediaQuery.addEventListener("change", apply);
    return () => mediaQuery.removeEventListener("change", apply);
  }, [theme]);

  function setTheme(next: Theme) {
    setThemeState(next);
    localStorage.setItem("aros-theme", next);
  }

  return { theme, setTheme };
}
```

- [ ] **Step 2: Write the Top Bar component**

Write `dashboard/src/components/shell/top-bar.tsx`:

```tsx
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "@/lib/hooks/use-theme";
import type { ConnectionStatus } from "@/lib/api/types";

const connectionStyles: Record<
  ConnectionStatus,
  { dot: string; label: string }
> = {
  connected: { dot: "bg-stage-approved", label: "Connected" },
  reconnecting: { dot: "bg-stage-human", label: "Reconnecting" },
  disconnected: { dot: "bg-stage-rejected", label: "Disconnected" },
};

interface TopBarProps {
  connectionStatus: ConnectionStatus;
  onRetry?: () => void;
}

export function TopBar({ connectionStatus, onRetry }: TopBarProps) {
  const { theme, setTheme } = useTheme();
  const conn = connectionStyles[connectionStatus];

  function cycleTheme() {
    const next =
      theme === "system" ? "dark" : theme === "dark" ? "light" : "system";
    setTheme(next);
  }

  const ThemeIcon =
    theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <header className="h-topbar flex items-center justify-between border-b border-border px-4 bg-background shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-text-primary tracking-tight">
          AROS
        </span>
        <div className="w-px h-5 bg-border" />
        <span className="text-xs text-text-muted hidden sm:inline">
          Agent Review Orchestration
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
          <div className={`w-1.5 h-1.5 rounded-full ${conn.dot}`} />
          <span>{conn.label}</span>
          {connectionStatus === "disconnected" && onRetry && (
            <button
              onClick={onRetry}
              className="text-active underline ml-1 cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>

        <button
          onClick={cycleTheme}
          className="p-1.5 rounded-md hover:bg-surface transition-colors cursor-pointer"
          aria-label={`Theme: ${theme}. Click to change.`}
        >
          <ThemeIcon className="w-4 h-4 text-text-secondary" />
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Write the Icon Rail component**

Write `dashboard/src/components/shell/icon-rail.tsx`:

```tsx
import { FileText, Activity, Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const navItems = [
  { path: "/review", icon: FileText, label: "Review" },
  { path: "/pipeline", icon: Activity, label: "Pipeline" },
  { path: "/policies", icon: Settings, label: "Policies" },
] as const;

export function IconRail() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <TooltipProvider delayDuration={300}>
      <nav
        className="w-rail flex flex-col items-center pt-3 gap-1 border-r border-border bg-background shrink-0"
        aria-label="Main navigation"
      >
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname.startsWith(path);
          return (
            <Tooltip key={path}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate(path)}
                  className={cn(
                    "w-9 h-9 flex items-center justify-center rounded-lg transition-colors cursor-pointer",
                    isActive
                      ? "bg-surface border border-active"
                      : "hover:bg-surface"
                  )}
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon
                    className={cn(
                      "w-[18px] h-[18px]",
                      isActive ? "text-active" : "text-text-muted"
                    )}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}
```

- [ ] **Step 4: Write the Layout shell**

Write `dashboard/src/components/shell/layout.tsx`:

```tsx
import { Outlet } from "react-router-dom";
import { TopBar } from "./top-bar";
import { IconRail } from "./icon-rail";
import type { ConnectionStatus } from "@/lib/api/types";

interface LayoutProps {
  connectionStatus: ConnectionStatus;
  onRetry?: () => void;
}

export function Layout({ connectionStatus, onRetry }: LayoutProps) {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TopBar connectionStatus={connectionStatus} onRetry={onRetry} />
      <div className="flex flex-1 min-h-0">
        <IconRail />
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update App.tsx to use the Layout**

Update `dashboard/src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/shell/layout";

function ReviewPage() {
  return <div className="p-4 text-text-primary">Review Workspace</div>;
}

function PipelinePage() {
  return <div className="p-4 text-text-primary">Pipeline Monitor</div>;
}

function PoliciesPage() {
  return <div className="p-4 text-text-primary">Policies Manager</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          element={<Layout connectionStatus="connected" />}
        >
          <Route path="/" element={<Navigate to="/review" replace />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/policies" element={<PoliciesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 6: Run dev server and verify**

```bash
cd dashboard
npm run dev
```

Expected: AROS wordmark in top bar, green "Connected" dot, theme toggle cycling through light/dark/system, icon rail with 3 icons on the left, clicking icons navigates between routes, active icon gets blue highlight.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/
git commit -m "feat(dashboard): add app shell with top bar, icon rail, and layout"
```

---

### Task 5: App Context + Reducer

**Files:**
- Create: `dashboard/src/context/app-reducer.ts`
- Create: `dashboard/src/context/app-context.tsx`
- Modify: `dashboard/src/App.tsx`

- [ ] **Step 1: Write the reducer**

Write `dashboard/src/context/app-reducer.ts`:

```typescript
import type {
  DeliverableSummary,
  Deliverable,
  PipelineCounts,
  ConnectionStatus,
} from "@/lib/api/types";

export interface AppState {
  queue: DeliverableSummary[];
  selectedId: string | null;
  selectedDeliverable: Deliverable | null;
  pipelineCounts: PipelineCounts;
  connectionStatus: ConnectionStatus;
  loading: boolean;
}

export const initialState: AppState = {
  queue: [],
  selectedId: null,
  selectedDeliverable: null,
  pipelineCounts: {
    in_progress: 0,
    pending_human: 0,
    awaiting_revisions: 0,
    approved_72h: 0,
    rejected_72h: 0,
  },
  connectionStatus: "disconnected",
  loading: true,
};

export type AppAction =
  | { type: "SET_QUEUE"; queue: DeliverableSummary[] }
  | { type: "SELECT_DELIVERABLE"; id: string | null }
  | { type: "SET_SELECTED_DETAIL"; deliverable: Deliverable }
  | { type: "REMOVE_FROM_QUEUE"; id: string }
  | { type: "ADD_TO_QUEUE"; item: DeliverableSummary }
  | { type: "SET_PIPELINE_COUNTS"; counts: PipelineCounts }
  | { type: "SET_CONNECTION_STATUS"; status: ConnectionStatus }
  | { type: "SET_LOADING"; loading: boolean };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_QUEUE":
      return { ...state, queue: action.queue, loading: false };

    case "SELECT_DELIVERABLE":
      return { ...state, selectedId: action.id, selectedDeliverable: null };

    case "SET_SELECTED_DETAIL":
      return { ...state, selectedDeliverable: action.deliverable };

    case "REMOVE_FROM_QUEUE": {
      const queue = state.queue.filter((d) => d.id !== action.id);
      const selectedId =
        state.selectedId === action.id
          ? queue[0]?.id ?? null
          : state.selectedId;
      return {
        ...state,
        queue,
        selectedId,
        selectedDeliverable:
          state.selectedId === action.id ? null : state.selectedDeliverable,
      };
    }

    case "ADD_TO_QUEUE":
      if (state.queue.some((d) => d.id === action.item.id)) return state;
      return { ...state, queue: [...state.queue, action.item] };

    case "SET_PIPELINE_COUNTS":
      return { ...state, pipelineCounts: action.counts };

    case "SET_CONNECTION_STATUS":
      return { ...state, connectionStatus: action.status };

    case "SET_LOADING":
      return { ...state, loading: action.loading };

    default:
      return state;
  }
}
```

- [ ] **Step 2: Write the context provider**

Write `dashboard/src/context/app-context.tsx`:

```tsx
import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  type ReactNode,
  type Dispatch,
} from "react";
import { appReducer, initialState, type AppState, type AppAction } from "./app-reducer";
import { api } from "@/lib/api/client";

interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  selectDeliverable: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const selectDeliverable = useCallback(
    (id: string) => {
      dispatch({ type: "SELECT_DELIVERABLE", id });
      api.getDeliverable(id).then((deliverable) => {
        dispatch({ type: "SET_SELECTED_DETAIL", deliverable });
      });
    },
    []
  );

  // Load initial queue
  useEffect(() => {
    api
      .listDeliverables("human")
      .then((queue) => {
        dispatch({ type: "SET_QUEUE", queue });
        if (queue.length > 0) {
          selectDeliverable(queue[0].id);
        }
      })
      .catch(() => dispatch({ type: "SET_LOADING", loading: false }));
    api
      .getPipelineCounts()
      .then((counts) => {
        dispatch({ type: "SET_PIPELINE_COUNTS", counts });
      })
      .catch(() => {});
    dispatch({ type: "SET_CONNECTION_STATUS", status: "connected" });
  }, [selectDeliverable]);

  return (
    <AppContext.Provider value={{ state, dispatch, selectDeliverable }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
```

- [ ] **Step 3: Wrap the app with AppProvider**

Update `dashboard/src/App.tsx` to wrap `<Routes>` with `<AppProvider>`.

- [ ] **Step 4: Verify state loads**

```bash
cd dashboard
npm run dev
```

Open React DevTools or add a temporary `console.log(state)` in a page component. Expected: queue has mock deliverables, pipeline counts populated, connection shows "connected".

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/context/
git commit -m "feat(dashboard): add app context with reducer for deliverables and pipeline state"
```

---

## Chunk 2: Review Workspace

### Task 6: Shared Hooks

**Files:**
- Create: `dashboard/src/lib/hooks/use-keyboard.ts`
- Create: `dashboard/src/lib/hooks/use-panel-state.ts`
- Create: `dashboard/src/lib/hooks/use-relative-time.ts`

- [ ] **Step 1: Write use-relative-time hook**

Write `dashboard/src/lib/hooks/use-relative-time.ts`:

```typescript
import { useState, useEffect } from "react";

export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function useRelativeTime(dateStr: string | null, intervalMs = 60_000) {
  const [display, setDisplay] = useState(() =>
    dateStr ? formatRelativeTime(dateStr) : ""
  );

  useEffect(() => {
    if (!dateStr) return;
    setDisplay(formatRelativeTime(dateStr));
    const id = setInterval(
      () => setDisplay(formatRelativeTime(dateStr)),
      intervalMs
    );
    return () => clearInterval(id);
  }, [dateStr, intervalMs]);

  return display;
}
```

- [ ] **Step 2: Write use-panel-state hook**

Write `dashboard/src/lib/hooks/use-panel-state.ts`:

```typescript
import { useState, useCallback } from "react";

export function usePanelState(key: string, defaultOpen = true) {
  const [isOpen, setIsOpen] = useState(() => {
    const stored = localStorage.getItem(`aros-panel-${key}`);
    return stored !== null ? stored === "true" : defaultOpen;
  });

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      localStorage.setItem(`aros-panel-${key}`, String(next));
      return next;
    });
  }, [key]);

  return { isOpen, toggle };
}
```

- [ ] **Step 3: Write use-keyboard hook**

Write `dashboard/src/lib/hooks/use-keyboard.ts`:

```typescript
import { useEffect } from "react";

type KeyHandler = () => void;
type KeyMap = Record<string, KeyHandler>;

export function useKeyboard(keyMap: KeyMap) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const fn = keyMap[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [keyMap]);
}
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/lib/hooks/
git commit -m "feat(dashboard): add shared hooks (relative time, panel state, keyboard shortcuts)"
```

---

### Task 7: Queue Sidebar

**Files:**
- Create: `dashboard/src/components/review/score-badge.tsx`
- Create: `dashboard/src/components/review/queue-item.tsx`
- Create: `dashboard/src/components/review/queue-sidebar.tsx`

- [ ] **Step 1: Write ScoreBadge component**

Write `dashboard/src/components/review/score-badge.tsx`:

```tsx
import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number | null;
  size?: "sm" | "md";
}

export function ScoreBadge({ score, size = "sm" }: ScoreBadgeProps) {
  if (score === null) return <span className="text-text-muted">—</span>;

  const color =
    score >= 7
      ? "text-stage-approved"
      : score >= 6
        ? "text-stage-human"
        : "text-stage-rejected";

  return (
    <span
      className={cn(
        "font-semibold",
        color,
        size === "sm" ? "text-xs" : "text-sm"
      )}
      aria-label={`Score: ${score.toFixed(1)}`}
    >
      {score.toFixed(1)}
    </span>
  );
}
```

- [ ] **Step 2: Write QueueItem component**

Write `dashboard/src/components/review/queue-item.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { ScoreBadge } from "./score-badge";
import { useRelativeTime } from "@/lib/hooks/use-relative-time";
import type { DeliverableSummary } from "@/lib/api/types";

interface QueueItemProps {
  item: DeliverableSummary;
  isSelected: boolean;
  onClick: () => void;
}

export function QueueItem({ item, isSelected, onClick }: QueueItemProps) {
  const timeInQueue = useRelativeTime(item.entered_stage_at);

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg p-2.5 mb-1 transition-colors cursor-pointer",
        isSelected
          ? "bg-surface border-l-[3px] border-l-active"
          : "border-l-[3px] border-l-transparent hover:bg-surface/50"
      )}
    >
      <div className="flex justify-between items-start mb-1">
        <span
          className={cn(
            "text-[11px] font-medium truncate mr-2",
            isSelected ? "text-text-primary" : "text-text-secondary"
          )}
        >
          {item.title}
        </span>
        <ScoreBadge score={item.score} />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-text-muted truncate">
          {item.source_agent}
        </span>
        <span className="w-0.5 h-0.5 rounded-full bg-text-muted" />
        <span className="text-[9px] text-text-muted">{timeInQueue}</span>
        {item.is_folder && (
          <>
            <span className="w-0.5 h-0.5 rounded-full bg-text-muted" />
            <span className="text-[9px] px-1 py-px bg-stage-subjective/15 text-stage-subjective rounded">
              folder · {item.file_count} files
            </span>
          </>
        )}
      </div>
    </button>
  );
}
```

- [ ] **Step 3: Write QueueSidebar component**

Write `dashboard/src/components/review/queue-sidebar.tsx`:

```tsx
import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { QueueItem } from "./queue-item";
import { useApp } from "@/context/app-context";
import { cn } from "@/lib/utils";

type Filter = "pending" | "all" | "revisions";

export function QueueSidebar({ isOpen }: { isOpen: boolean }) {
  const { state, selectDeliverable } = useApp();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");

  const filtered = state.queue
    .filter((d) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !d.title.toLowerCase().includes(q) &&
          !d.source_agent.toLowerCase().includes(q)
        )
          return false;
      }
      if (filter === "pending") return d.stage === "human";
      if (filter === "revisions")
        return d.stage === "human" && d.revision_number > 1;
      return true;
    })
    .sort(
      (a, b) =>
        new Date(a.entered_stage_at).getTime() -
        new Date(b.entered_stage_at).getTime()
    );

  if (!isOpen) return null;

  const filters: { key: Filter; label: string }[] = [
    { key: "pending", label: "Pending" },
    { key: "all", label: "All" },
    { key: "revisions", label: "Revisions" },
  ];

  return (
    <aside className="w-queue flex flex-col border-r border-border bg-background shrink-0">
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-text-primary">
            Review Queue
          </span>
          <span className="bg-active text-background text-[10px] font-semibold px-1.5 rounded-full">
            {filtered.length}
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search deliverables..."
            className="h-7 pl-7 text-xs bg-surface border-none"
          />
        </div>
      </div>

      <div className="flex gap-1 px-2 py-1.5 border-b border-border">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              "text-[10px] px-2 py-0.5 rounded transition-colors cursor-pointer",
              filter === key
                ? "bg-surface text-active border border-active/30"
                : "text-text-muted hover:text-text-secondary"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1">
          {filtered.map((item) => (
            <QueueItem
              key={item.id}
              item={item}
              isSelected={item.id === state.selectedId}
              onClick={() => selectDeliverable(item.id)}
            />
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-text-muted text-center py-8">
              No deliverables
            </p>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/review/
git commit -m "feat(dashboard): add queue sidebar with search, filters, and score badges"
```

---

### Task 8: Content Area + Content Header

**Files:**
- Create: `dashboard/src/components/review/content-header.tsx`
- Create: `dashboard/src/components/review/content-area.tsx`

- [ ] **Step 1: Write ContentHeader**

Write `dashboard/src/components/review/content-header.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "./score-badge";
import { cn } from "@/lib/utils";
import type { Deliverable } from "@/lib/api/types";

function scoreContainerClass(score: number | null): string {
  if (score === null) return "bg-surface text-text-muted";
  if (score >= 7) return "bg-stage-approved/10 text-stage-approved";
  if (score >= 6) return "bg-stage-human/10 text-stage-human";
  return "bg-stage-rejected/10 text-stage-rejected";
}

export function ContentHeader({
  deliverable,
}: {
  deliverable: Deliverable;
}) {
  return (
    <div className="px-5 py-3 border-b border-border shrink-0">
      <h1 className="text-sm font-semibold text-text-primary mb-1">
        {deliverable.title}
      </h1>
      <div className="flex items-center gap-2">
        <div className={cn("flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded", scoreContainerClass(deliverable.score))}>
          Score: <ScoreBadge score={deliverable.score} />
        </div>
        <span className="text-[10px] text-text-muted">
          Policy: {deliverable.policy}
        </span>
        {deliverable.revision_number > 1 && (
          <Badge variant="outline" className="text-[10px] h-4">
            v{deliverable.revision_number}
          </Badge>
        )}
        {deliverable.is_folder && (
          <Badge variant="outline" className="text-[10px] h-4 text-stage-subjective border-stage-subjective/30">
            Folder · {deliverable.file_count} files
          </Badge>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write ContentArea**

Write `dashboard/src/components/review/content-area.tsx`:

```tsx
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Deliverable } from "@/lib/api/types";

export function ContentArea({
  deliverable,
}: {
  deliverable: Deliverable;
}) {
  return (
    <ScrollArea className="flex-1">
      <div className="px-5 py-4 max-w-content mx-auto">
        <article className="prose prose-sm dark:prose-invert prose-headings:text-text-primary prose-p:text-text-secondary prose-p:leading-relaxed max-w-none">
          <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
            {deliverable.content}
          </ReactMarkdown>
        </article>
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/review/content-header.tsx dashboard/src/components/review/content-area.tsx
git commit -m "feat(dashboard): add content header and markdown content area"
```

---

### Task 9: Context Panel (Brief, Objective, Subjective, History tabs)

**Files:**
- Create: `dashboard/src/components/review/brief-tab.tsx`
- Create: `dashboard/src/components/review/objective-tab.tsx`
- Create: `dashboard/src/components/review/subjective-tab.tsx`
- Create: `dashboard/src/components/review/history-tab.tsx`
- Create: `dashboard/src/components/review/context-panel.tsx`

- [ ] **Step 1: Write BriefTab**

Write `dashboard/src/components/review/brief-tab.tsx`:

```tsx
import { ScrollArea } from "@/components/ui/scroll-area";

export function BriefTab({ brief }: { brief: string }) {
  return (
    <ScrollArea className="flex-1">
      <div className="p-3 text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
        {brief}
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 2: Write ObjectiveTab**

Write `dashboard/src/components/review/objective-tab.tsx`:

```tsx
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ObjectiveCheck } from "@/lib/api/types";

const icons = {
  pass: <CheckCircle2 className="w-3.5 h-3.5 text-stage-approved" />,
  fail: <XCircle className="w-3.5 h-3.5 text-stage-rejected" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 text-stage-human" />,
};

export function ObjectiveTab({
  checks,
}: {
  checks: ObjectiveCheck[] | null;
}) {
  if (!checks) {
    return (
      <p className="p-3 text-xs text-text-muted">
        Objective checks not yet run.
      </p>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-3 space-y-1">
        {checks.map((check, i) => (
          <div
            key={i}
            className="flex items-start gap-2 py-1.5 border-b border-border last:border-0"
          >
            {check.passed
              ? icons.pass
              : check.severity === "warning"
                ? icons.warning
                : icons.fail}
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-text-primary font-medium">
                {check.name}
              </div>
              {check.details && (
                <div className="text-[10px] text-text-muted mt-0.5">
                  {check.details}
                </div>
              )}
            </div>
            <span className="text-[9px] text-text-muted shrink-0">
              {check.severity}
            </span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 3: Write SubjectiveTab**

Write `dashboard/src/components/review/subjective-tab.tsx`:

```tsx
import { ScrollArea } from "@/components/ui/scroll-area";
import { ScoreBadge } from "./score-badge";
import type { SubjectiveCriterion } from "@/lib/api/types";

export function SubjectiveTab({
  criteria,
  overallScore,
}: {
  criteria: SubjectiveCriterion[] | null;
  overallScore: number | null;
}) {
  if (!criteria) {
    return (
      <p className="p-3 text-xs text-text-muted">
        Subjective review not yet run.
      </p>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-3">
        {overallScore !== null && (
          <div className="flex justify-between items-center py-1.5 mb-2 border-b border-border">
            <span className="text-[11px] text-text-primary font-semibold">
              Overall
            </span>
            <ScoreBadge score={overallScore} size="md" />
          </div>
        )}

        {criteria.map((c, i) => (
          <div key={i} className="py-1.5 border-b border-border last:border-0">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] text-text-secondary">
                {c.name}
              </span>
              <ScoreBadge score={c.score} />
            </div>
            {c.rationale && (
              <p className="text-[9px] text-text-muted leading-relaxed mt-1 bg-surface p-2 rounded">
                {c.rationale}
              </p>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 4: Write HistoryTab**

Write `dashboard/src/components/review/history-tab.tsx`:

```tsx
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatRelativeTime } from "@/lib/hooks/use-relative-time";
import type { RevisionEntry } from "@/lib/api/types";

export function HistoryTab({ history }: { history: RevisionEntry[] }) {
  if (history.length === 0) {
    return (
      <p className="p-3 text-xs text-text-muted">Original submission.</p>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-3 space-y-3">
        {history.map((entry) => (
          <div key={entry.version} className="border-b border-border pb-3 last:border-0">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] text-text-primary font-medium">
                v{entry.version}
              </span>
              <span className="text-[9px] text-text-muted">
                {formatRelativeTime(entry.timestamp)}
              </span>
            </div>
            <p className="text-[10px] text-text-secondary">{entry.summary}</p>
            {entry.feedback && (
              <div className="mt-1.5 bg-surface p-2 rounded text-[9px] text-text-muted">
                <span className="font-medium text-text-secondary">
                  Feedback:
                </span>{" "}
                {entry.feedback.summary}
              </div>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 5: Write ContextPanel composing the 4 tabs**

Write `dashboard/src/components/review/context-panel.tsx`:

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BriefTab } from "./brief-tab";
import { ObjectiveTab } from "./objective-tab";
import { SubjectiveTab } from "./subjective-tab";
import { HistoryTab } from "./history-tab";
import type { Deliverable } from "@/lib/api/types";

interface ContextPanelProps {
  deliverable: Deliverable;
  isOpen: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function ContextPanel({
  deliverable,
  isOpen,
  activeTab,
  onTabChange,
}: ContextPanelProps) {
  if (!isOpen) return null;

  return (
    <aside className="w-context flex flex-col border-l border-border shrink-0">
      <Tabs value={activeTab} onValueChange={onTabChange} className="flex flex-col flex-1 min-h-0">
        <TabsList className="w-full rounded-none border-b border-border bg-transparent h-auto p-0 justify-start">
          {["brief", "objective", "subjective", "history"].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="flex-1 text-[10px] py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-active data-[state=active]:text-active data-[state=active]:bg-transparent text-text-muted capitalize"
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="brief" className="flex-1 min-h-0 m-0">
          <BriefTab brief={deliverable.brief} />
        </TabsContent>
        <TabsContent value="objective" className="flex-1 min-h-0 m-0">
          <ObjectiveTab checks={deliverable.objective_results} />
        </TabsContent>
        <TabsContent value="subjective" className="flex-1 min-h-0 m-0">
          <SubjectiveTab
            criteria={deliverable.subjective_results}
            overallScore={deliverable.score}
          />
        </TabsContent>
        <TabsContent value="history" className="flex-1 min-h-0 m-0">
          <HistoryTab history={deliverable.history} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/components/review/
git commit -m "feat(dashboard): add context panel with Brief, Objective, Subjective, and History tabs"
```

---

### Task 10: Decision Bar

**Files:**
- Create: `dashboard/src/components/review/decision-bar.tsx`

- [ ] **Step 1: Write DecisionBar component**

Write `dashboard/src/components/review/decision-bar.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api/client";
import { useApp } from "@/context/app-context";
import { toast } from "sonner";
import type { Decision } from "@/lib/api/types";

export function DecisionBar({ deliverableId }: { deliverableId: string }) {
  const { dispatch } = useApp();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(decision: Decision) {
    if (decision !== "approved" && !reason.trim()) return;
    setSubmitting(true);
    try {
      await api.submitDecision(deliverableId, {
        decision,
        reason: reason.trim() || undefined,
      });
      dispatch({ type: "REMOVE_FROM_QUEUE", id: deliverableId });
      setReason("");
      toast.success(
        decision === "approved"
          ? "Approved"
          : decision === "revision_requested"
            ? "Revision requested"
            : "Rejected"
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error("Already decided by another reviewer");
        dispatch({ type: "REMOVE_FROM_QUEUE", id: deliverableId });
      } else {
        toast.error(
          err instanceof Error ? err.message : "Failed to submit decision"
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="h-decision flex items-center gap-3 px-5 border-t border-border bg-background shrink-0">
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Add a reason (required for Revise/Reject)..."
        className="flex-1 h-8 text-xs bg-surface border-none"
        disabled={submitting}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => submit("approved")}
          disabled={submitting}
          className="bg-stage-approved hover:bg-stage-approved/90 text-background font-semibold text-xs cursor-pointer"
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => submit("revision_requested")}
          disabled={submitting || !reason.trim()}
          className="text-stage-revising border-stage-revising/30 hover:bg-stage-revising/10 text-xs cursor-pointer"
        >
          Revise
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => submit("rejected")}
          disabled={submitting || !reason.trim()}
          className="text-stage-rejected border-stage-rejected/30 hover:bg-stage-rejected/10 text-xs cursor-pointer"
        >
          Reject
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/review/decision-bar.tsx
git commit -m "feat(dashboard): add decision bar with approve/revise/reject and error handling"
```

---

### Task 11: Review Page Composition + Keyboard Shortcuts

**Files:**
- Create: `dashboard/src/pages/review-page.tsx`
- Modify: `dashboard/src/App.tsx`

- [ ] **Step 1: Write ReviewPage composing all review components**

Write `dashboard/src/pages/review-page.tsx`:

```tsx
import { useState, useMemo } from "react";
import { useApp } from "@/context/app-context";
import { useKeyboard } from "@/lib/hooks/use-keyboard";
import { usePanelState } from "@/lib/hooks/use-panel-state";
import { QueueSidebar } from "@/components/review/queue-sidebar";
import { ContentHeader } from "@/components/review/content-header";
import { ContentArea } from "@/components/review/content-area";
import { ContextPanel } from "@/components/review/context-panel";
import { DecisionBar } from "@/components/review/decision-bar";

const TAB_MAP: Record<string, string> = {
  "1": "brief",
  "2": "objective",
  "3": "subjective",
  "4": "history",
};

export function ReviewPage() {
  const { state, selectDeliverable } = useApp();
  const queue = usePanelState("queue", true);
  const context = usePanelState("context", true);
  const [contextTab, setContextTab] = useState("brief");

  const keyMap = useMemo(
    () => ({
      "[": queue.toggle,
      "]": context.toggle,
      j: () => {
        const idx = state.queue.findIndex((d) => d.id === state.selectedId);
        if (idx < state.queue.length - 1) {
          selectDeliverable(state.queue[idx + 1].id);
        }
      },
      k: () => {
        const idx = state.queue.findIndex((d) => d.id === state.selectedId);
        if (idx > 0) {
          selectDeliverable(state.queue[idx - 1].id);
        }
      },
      ...Object.fromEntries(
        Object.entries(TAB_MAP).map(([key, tab]) => [
          key,
          () => setContextTab(tab),
        ])
      ),
    }),
    [state.queue, state.selectedId, queue.toggle, context.toggle, selectDeliverable]
  );

  useKeyboard(keyMap);

  const deliverable = state.selectedDeliverable;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 min-h-0">
        <QueueSidebar isOpen={queue.isOpen} />

        <div className="flex-1 flex flex-col min-w-0">
          {deliverable ? (
            <>
              <ContentHeader deliverable={deliverable} />
              <ContentArea deliverable={deliverable} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-text-muted">
                {state.loading
                  ? "Loading..."
                  : "Select a deliverable to review"}
              </p>
            </div>
          )}
        </div>

        {deliverable && (
          <ContextPanel
            deliverable={deliverable}
            isOpen={context.isOpen}
            activeTab={contextTab}
            onTabChange={setContextTab}
          />
        )}
      </div>

      {deliverable && <DecisionBar deliverableId={deliverable.id} />}
    </div>
  );
}
```

- [ ] **Step 2: Update App.tsx to use ReviewPage**

Replace the placeholder `ReviewPage` function in `App.tsx` with an import from `@/pages/review-page`.

- [ ] **Step 3: Add Sonner Toaster to App.tsx**

Add `<Toaster />` from `sonner` inside the `BrowserRouter`, after `Routes`.

- [ ] **Step 4: Run dev server and verify the full review workspace**

```bash
cd dashboard
npm run dev
```

Expected:
- Queue sidebar shows mock deliverables with scores and times
- Clicking a queue item loads its content in the center and context on the right
- Context panel tabs (Brief, Objective, Subjective, History) show appropriate content
- Decision bar at bottom with reason field and 3 buttons
- Approve works (item removed from queue, next auto-selected)
- Revise/Reject disabled when reason is empty
- `[` toggles queue, `]` toggles context, `j`/`k` navigate queue, `1-4` switch tabs

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/review-page.tsx dashboard/src/App.tsx
git commit -m "feat(dashboard): compose review workspace with keyboard shortcuts"
```

---

## Chunk 3: SSE + Pipeline + Folders

### Task 12: SSE Integration

**Files:**
- Create: `dashboard/src/lib/api/sse.ts`
- Modify: `dashboard/src/context/app-context.tsx`

- [ ] **Step 1: Write SSE connection manager**

Write `dashboard/src/lib/api/sse.ts`:

```typescript
import type { SSEEventType, ConnectionStatus } from "./types";

type SSECallback = (event: SSEEventType, data: Record<string, unknown>) => void;
type StatusCallback = (status: ConnectionStatus) => void;

const API_URL = import.meta.env.VITE_AROS_API_URL || "";

export class SSEManager {
  private eventSource: EventSource | null = null;
  private onEvent: SSECallback;
  private onStatus: StatusCallback;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30_000;
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(onEvent: SSECallback, onStatus: StatusCallback) {
    this.onEvent = onEvent;
    this.onStatus = onStatus;
  }

  private hasConnected = false;

  connect() {
    if (this.disposed || !API_URL) {
      // Mock mode — simulate connected
      this.onStatus("connected");
      return;
    }

    this.onStatus(this.hasConnected ? "reconnecting" : "disconnected");
    const es = new EventSource(`${API_URL}/events`);
    this.eventSource = es;

    es.onopen = () => {
      this.hasConnected = true;
      this.reconnectDelay = 1000;
      this.onStatus("connected");
      this.resetHeartbeat();
    };

    es.onmessage = (e) => {
      this.resetHeartbeat();
      try {
        const parsed = JSON.parse(e.data);
        this.onEvent(parsed.type, parsed.data || parsed);
      } catch {
        // Heartbeat or unparseable — ignore
      }
    };

    es.onerror = () => {
      this.cleanup();
      this.onStatus("reconnecting");
      this.scheduleReconnect();
    };
  }

  private resetHeartbeat() {
    if (this.heartbeatTimeout) clearTimeout(this.heartbeatTimeout);
    this.heartbeatTimeout = setTimeout(() => {
      // No heartbeat for 60s — reconnect
      this.cleanup();
      this.onStatus("reconnecting");
      this.scheduleReconnect();
    }, 60_000);
  }

  private scheduleReconnect() {
    if (this.disposed) return;
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      this.maxReconnectDelay
    );
  }

  private cleanup() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  retry() {
    this.reconnectDelay = 1000;
    this.connect();
  }

  dispose() {
    this.disposed = true;
    this.cleanup();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
}
```

- [ ] **Step 2: Integrate SSE into AppProvider**

Update `dashboard/src/context/app-context.tsx` to:
- Create an `SSEManager` instance in a `useEffect`
- Dispatch `SET_CONNECTION_STATUS` on status changes
- Handle all four SSE event types:
  - `deliverable:submitted`: Refresh pipeline counts via `api.getPipelineCounts()`. If the delivered stage is `human`, dispatch `ADD_TO_QUEUE`.
  - `deliverable:stage_changed`: If new stage is `human`, dispatch `ADD_TO_QUEUE` and fire a browser Notification if the tab is not focused. If old stage was `human`, dispatch `REMOVE_FROM_QUEUE`. Refresh pipeline counts.
  - `deliverable:decided`: Dispatch `REMOVE_FROM_QUEUE`. Refresh pipeline counts.
  - `deliverable:revised`: Refresh pipeline counts. If the deliverable is currently selected (`state.selectedId`), re-fetch its detail via `api.getDeliverable()` and dispatch `SET_SELECTED_DETAIL`.
- Expose a `retry` function from the context for the "Retry" button
- Clean up with `dispose()` on unmount

- [ ] **Step 3: Wire connection status and retry to the Layout**

Update `App.tsx` to pass `state.connectionStatus` and the `retry` function from context to `<Layout>`.

- [ ] **Step 4: Add browser notification permission request**

In `AppProvider`, request notification permission lazily — not on mount but on the first SSE event that would trigger a notification (e.g., a new deliverable entering human review). If `Notification.permission === "default"`, call `Notification.requestPermission()` at that point. This follows browser best practices and avoids prompts before user engagement.

- [ ] **Step 5: Verify SSE mock mode**

```bash
cd dashboard
npm run dev
```

Expected: connection indicator shows "Connected" (mock mode). When `VITE_AROS_API_URL` is set to a nonexistent server, the indicator should show "Reconnecting" then "Disconnected" with a "Retry" link.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/lib/api/sse.ts dashboard/src/context/
git commit -m "feat(dashboard): add SSE integration with reconnect and browser notifications"
```

---

### Task 13: Pipeline Monitor

**Files:**
- Create: `dashboard/src/components/pipeline/stage-card.tsx`
- Create: `dashboard/src/components/pipeline/stage-cards.tsx`
- Create: `dashboard/src/components/pipeline/deliverable-table.tsx`
- Create: `dashboard/src/pages/pipeline-page.tsx`
- Modify: `dashboard/src/App.tsx`

- [ ] **Step 1: Write StageCard**

Write `dashboard/src/components/pipeline/stage-card.tsx`:

```tsx
import { cn } from "@/lib/utils";

interface StageCardProps {
  label: string;
  count: number;
  color: string;
  subtitle?: string;
  isSelected: boolean;
  onClick: () => void;
}

export function StageCard({
  label,
  count,
  color,
  subtitle,
  isSelected,
  onClick,
}: StageCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 min-w-[120px] bg-surface rounded-lg p-3 text-left transition-colors cursor-pointer",
        isSelected ? "border border-active" : "border border-transparent"
      )}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`w-2 h-2 rounded-sm ${color}`} />
        <span className="text-[10px] text-text-primary font-medium">
          {label}
        </span>
      </div>
      <div className="text-xl font-bold text-text-primary">{count}</div>
      {subtitle && (
        <div className="text-[8px] text-text-muted mt-0.5">{subtitle}</div>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Write StageCards row**

Write `dashboard/src/components/pipeline/stage-cards.tsx`:

```tsx
import { StageCard } from "./stage-card";
import type { PipelineCounts } from "@/lib/api/types";

interface StageCardsProps {
  counts: PipelineCounts;
  selectedStage: string;
  onSelect: (stage: string) => void;
}

export function StageCards({ counts, selectedStage, onSelect }: StageCardsProps) {
  const cards = [
    { key: "in_progress", label: "In Progress", count: counts.in_progress, color: "bg-stage-objective", subtitle: "objective + subjective" },
    { key: "pending_human", label: "Pending Human", count: counts.pending_human, color: "bg-stage-human" },
    { key: "awaiting_revisions", label: "Awaiting Revisions", count: counts.awaiting_revisions, color: "bg-stage-revising" },
    { key: "approved_72h", label: "Approved", count: counts.approved_72h, color: "bg-stage-approved", subtitle: "last 72h" },
    { key: "rejected_72h", label: "Rejected", count: counts.rejected_72h, color: "bg-stage-rejected", subtitle: "last 72h" },
  ];

  return (
    <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Pipeline stages">
      {cards.map((card) => (
        <StageCard
          key={card.key}
          {...card}
          isSelected={selectedStage === card.key}
          onClick={() => onSelect(card.key)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write DeliverableTable**

Write `dashboard/src/components/pipeline/deliverable-table.tsx`:

```tsx
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronUp, ChevronDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRelativeTime } from "@/lib/hooks/use-relative-time";
import { cn } from "@/lib/utils";
import type { DeliverableSummary, Stage } from "@/lib/api/types";

type SortKey = "title" | "stage" | "policy" | "source_agent" | "entered_stage_at";
type SortDir = "asc" | "desc";

const stageStyles: Record<string, { bg: string; text: string }> = {
  objective: { bg: "bg-stage-objective/15", text: "text-stage-objective" },
  subjective: { bg: "bg-stage-subjective/15", text: "text-stage-subjective" },
  human: { bg: "bg-stage-human/15", text: "text-stage-human" },
  revision_requested: { bg: "bg-stage-revising/15", text: "text-stage-revising" },
  approved: { bg: "bg-stage-approved/15", text: "text-stage-approved" },
  auto_approved: { bg: "bg-stage-approved/15", text: "text-stage-approved" },
  rejected: { bg: "bg-stage-rejected/15", text: "text-stage-rejected" },
};

const stageLabels: Record<string, string> = {
  revision_requested: "Revising",
  auto_approved: "Auto-approved",
};

function StagePill({ stage }: { stage: Stage }) {
  const style = stageStyles[stage] || stageStyles.objective;
  const label = stageLabels[stage] || stage.charAt(0).toUpperCase() + stage.slice(1);
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
      {label}
    </span>
  );
}

function TimeCell({ dateStr }: { dateStr: string }) {
  const time = useRelativeTime(dateStr);
  return <span>{time === "just now" ? time : `${time} ago`}</span>;
}

interface DeliverableTableProps {
  deliverables: DeliverableSummary[];
}

export function DeliverableTable({ deliverables }: DeliverableTableProps) {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>("entered_stage_at");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    return [...deliverables].sort((a, b) => {
      const aVal = a[sortKey] ?? "";
      const bVal = b[sortKey] ?? "";
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [deliverables, sortKey, sortDir]);

  const columns: { key: SortKey; label: string; flex: string }[] = [
    { key: "title", label: "Deliverable", flex: "flex-[3]" },
    { key: "stage", label: "Stage", flex: "flex-1" },
    { key: "policy", label: "Policy", flex: "flex-1" },
    { key: "source_agent", label: "Agent", flex: "flex-1" },
    { key: "entered_stage_at", label: "Entered", flex: "flex-1" },
  ];

  return (
    <ScrollArea className="flex-1">
      <div className="bg-surface rounded-lg overflow-hidden">
        <div className="flex px-3 py-2 border-b border-border text-[9px] text-text-muted uppercase tracking-wider">
          {columns.map((col) => (
            <button
              key={col.key}
              onClick={() => toggleSort(col.key)}
              className={cn(
                col.flex,
                "flex items-center gap-0.5 cursor-pointer hover:text-text-secondary transition-colors text-left"
              )}
            >
              {col.label}
              {sortKey === col.key && (
                sortDir === "asc"
                  ? <ChevronUp className="w-2.5 h-2.5" />
                  : <ChevronDown className="w-2.5 h-2.5" />
              )}
            </button>
          ))}
        </div>
        {sorted.map((d) => (
          <div
            key={d.id}
            onClick={() => navigate(`/review?id=${d.id}`)}
            className="flex px-3 py-2 text-[11px] items-center border-b border-background last:border-0 hover:bg-background/50 cursor-pointer transition-colors"
          >
            <div className="flex-[3] text-text-primary truncate">
              {d.title}
              {d.is_folder && (
                <span className="text-[8px] text-stage-subjective ml-1">
                  folder
                </span>
              )}
            </div>
            <div className="flex-1">
              <StagePill stage={d.stage} />
            </div>
            <div className="flex-1 text-text-secondary">{d.policy}</div>
            <div className="flex-1 text-text-secondary">{d.source_agent}</div>
            <div className="flex-1 text-text-secondary">
              <TimeCell dateStr={d.entered_stage_at} />
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="py-8 text-center text-xs text-text-muted">
            No deliverables in this stage
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 4: Write PipelinePage**

Write `dashboard/src/pages/pipeline-page.tsx`:

```tsx
import { useState, useEffect } from "react";
import { StageCards } from "@/components/pipeline/stage-cards";
import { DeliverableTable } from "@/components/pipeline/deliverable-table";
import { useApp } from "@/context/app-context";
import { api } from "@/lib/api/client";
import type { DeliverableSummary } from "@/lib/api/types";

// "In Progress" combines objective + subjective stages
// We fetch both and merge client-side
const stageFilterMap: Record<string, string[] | string> = {
  in_progress: ["objective", "subjective"],
  pending_human: "human",
  awaiting_revisions: "revision_requested",
  approved_72h: "approved",
  rejected_72h: "rejected",
};

export function PipelinePage() {
  const { state } = useApp();
  const [selectedStage, setSelectedStage] = useState("in_progress");
  const [deliverables, setDeliverables] = useState<DeliverableSummary[]>([]);

  useEffect(() => {
    const filter = stageFilterMap[selectedStage];
    if (Array.isArray(filter)) {
      // Composite stage — fetch each and merge
      Promise.all(filter.map((s) => api.listDeliverables(s)))
        .then((results) => setDeliverables(results.flat()))
        .catch(() => setDeliverables([]));
    } else {
      api.listDeliverables(filter).then(setDeliverables).catch(() => setDeliverables([]));
    }
  }, [selectedStage]);

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      <StageCards
        counts={state.pipelineCounts}
        selectedStage={selectedStage}
        onSelect={setSelectedStage}
      />

      <div className="flex-1 min-h-0">
        <div className="text-xs font-semibold text-text-primary mb-2">
          {selectedStage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace("72h", "(72h)")}
          <span className="text-text-muted font-normal ml-2">
            — {deliverables.length} deliverables
          </span>
        </div>
        <DeliverableTable deliverables={deliverables} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update App.tsx to use PipelinePage**

Replace the placeholder `PipelinePage` in `App.tsx` with an import from `@/pages/pipeline-page`.

- [ ] **Step 6: Verify pipeline monitor**

```bash
cd dashboard
npm run dev
```

Navigate to `/pipeline`. Expected: 5 stage count cards with numbers, clicking a card filters the table below, clicking a table row navigates to `/review`.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/components/pipeline/ dashboard/src/pages/pipeline-page.tsx dashboard/src/App.tsx
git commit -m "feat(dashboard): add pipeline monitor with stage cards and deliverable table"
```

---

### Task 14: Folder Review (Image Grid + File Tabs)

**Files:**
- Create: `dashboard/src/components/folder/image-card.tsx`
- Create: `dashboard/src/components/folder/image-grid.tsx`
- Create: `dashboard/src/components/folder/single-image-view.tsx`
- Create: `dashboard/src/components/folder/file-tabs.tsx`
- Modify: `dashboard/src/pages/review-page.tsx`

- [ ] **Step 1: Write ImageCard**

Write `dashboard/src/components/folder/image-card.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { ScoreBadge } from "@/components/review/score-badge";
import type { DeliverableFile } from "@/lib/api/types";

interface ImageCardProps {
  file: DeliverableFile;
  isInspecting: boolean;
  onClick: () => void;
}

export function ImageCard({ file, isInspecting, onClick }: ImageCardProps) {
  // In a real app, the src would be an API URL to the image binary
  // For MVP, show a placeholder with the filename
  return (
    <button
      onClick={onClick}
      className={cn(
        "bg-surface rounded-xl overflow-hidden text-left transition-all cursor-pointer",
        isInspecting
          ? "ring-2 ring-active shadow-lg shadow-active/10"
          : "ring-1 ring-border hover:ring-text-muted"
      )}
    >
      <div className="aspect-video bg-gradient-to-br from-surface to-border flex items-center justify-center">
        <span className="text-lg font-bold text-text-muted">
          {file.filename.replace(/\.[^.]+$/, "").toUpperCase()}
        </span>
      </div>
      <div className="p-2.5">
        <div className="flex justify-between items-center mb-0.5">
          <span className="text-[11px] text-text-primary font-medium truncate mr-2">
            {file.filename}
          </span>
          <ScoreBadge score={file.score} />
        </div>
        <span className="text-[9px] text-text-muted">
          {file.content_type}
          {file.status === "passed" && " · Passed"}
          {file.status === "failed" && " · Failed"}
        </span>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Write ImageGrid**

Write `dashboard/src/components/folder/image-grid.tsx`:

```tsx
import { useState } from "react";
import { Grid2x2, Square } from "lucide-react";
import { ImageCard } from "./image-card";
import { SingleImageView } from "./single-image-view";
import { cn } from "@/lib/utils";
import type { DeliverableFile } from "@/lib/api/types";

interface ImageGridProps {
  files: DeliverableFile[];
  onInspect: (filename: string) => void;
  inspectedFile: string | null;
}

export function ImageGrid({ files, onInspect, inspectedFile }: ImageGridProps) {
  const [viewMode, setViewMode] = useState<"grid" | "single">("grid");

  if (viewMode === "single") {
    return (
      <SingleImageView
        files={files}
        currentFile={inspectedFile || files[0]?.filename}
        onSelect={(f) => onInspect(f)}
        onBack={() => setViewMode("grid")}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex justify-end px-4 pt-2 gap-1">
        <button
          onClick={() => setViewMode("grid")}
          className={cn(
            "text-[9px] px-2 py-1 rounded flex items-center gap-1 cursor-pointer",
            viewMode === "grid"
              ? "bg-surface text-active border border-active/30"
              : "text-text-muted"
          )}
        >
          <Grid2x2 className="w-2.5 h-2.5" /> Grid
        </button>
        <button
          onClick={() => setViewMode("single")}
          className="text-[9px] px-2 py-1 rounded flex items-center gap-1 text-text-muted cursor-pointer hover:text-text-secondary"
        >
          <Square className="w-2.5 h-2.5" /> Single
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          {files.map((file) => (
            <ImageCard
              key={file.filename}
              file={file}
              isInspecting={inspectedFile === file.filename}
              onClick={() => onInspect(file.filename)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write SingleImageView**

Write `dashboard/src/components/folder/single-image-view.tsx`:

```tsx
import { ChevronLeft, ChevronRight, Grid2x2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DeliverableFile } from "@/lib/api/types";

interface SingleImageViewProps {
  files: DeliverableFile[];
  currentFile: string;
  onSelect: (filename: string) => void;
  onBack: () => void;
}

export function SingleImageView({
  files,
  currentFile,
  onSelect,
  onBack,
}: SingleImageViewProps) {
  const idx = files.findIndex((f) => f.filename === currentFile);
  if (idx < 0) return null;
  const file = files[idx];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-xs cursor-pointer"
        >
          <Grid2x2 className="w-3 h-3 mr-1" /> Grid
        </Button>
        <span className="text-xs text-text-primary font-medium">
          {file?.filename} ({idx + 1}/{files.length})
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={idx <= 0}
            onClick={() => onSelect(files[idx - 1].filename)}
            className="cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={idx >= files.length - 1}
            onClick={() => onSelect(files[idx + 1].filename)}
            className="cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl aspect-video bg-gradient-to-br from-surface to-border rounded-xl flex items-center justify-center shadow-lg">
          <span className="text-3xl font-bold text-text-muted">
            {file?.filename.replace(/\.[^.]+$/, "").toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write FileTabs for text/code folders**

Write `dashboard/src/components/folder/file-tabs.tsx`:

```tsx
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeliverableFile } from "@/lib/api/types";

interface FileTabsProps {
  files: DeliverableFile[];
  activeFile: string | null;
  onSelect: (filename: string) => void;
}

export function FileTabs({ files, activeFile, onSelect }: FileTabsProps) {
  return (
    <div className="border-b border-border overflow-x-auto">
      <div className="flex px-2 min-w-max">
        {files.map((file) => (
          <button
            key={file.filename}
            onClick={() => onSelect(file.filename)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-[11px] border-b-2 whitespace-nowrap transition-colors cursor-pointer",
              activeFile === file.filename
                ? "border-active text-active"
                : "border-transparent text-text-muted hover:text-text-secondary"
            )}
          >
            {file.status === "passed" ? (
              <CheckCircle2 className="w-3 h-3 text-stage-approved" />
            ) : file.status === "failed" ? (
              <XCircle className="w-3 h-3 text-stage-rejected" />
            ) : null}
            {file.filename}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update ReviewPage to handle folder deliverables**

In `dashboard/src/pages/review-page.tsx`, detect when `deliverable.is_folder` is true and render `ImageGrid` (for image content types) or `FileTabs` + `ContentArea` (for text content types) instead of the standard `ContentArea`.

When a file is inspected in the grid, update the context panel to show that file's individual scores.

- [ ] **Step 6: Verify folder review**

```bash
cd dashboard
npm run dev
```

Select the folder deliverable from the queue. Expected: image grid renders with 2x2 layout, clicking an image highlights it and shows its scores in the context panel, Grid/Single toggle switches to full-size view with arrows.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/components/folder/ dashboard/src/pages/review-page.tsx
git commit -m "feat(dashboard): add folder review with image grid and file tabs"
```

---

## Chunk 4: Policies + Final

### Task 15: Policies Manager

**Files:**
- Create: `dashboard/src/components/policies/policy-list.tsx`
- Create: `dashboard/src/components/policies/pipeline-flow.tsx`
- Create: `dashboard/src/components/policies/settings-card.tsx`
- Create: `dashboard/src/components/policies/json-editor.tsx`
- Create: `dashboard/src/components/policies/policy-editor.tsx`
- Create: `dashboard/src/pages/policies-page.tsx`
- Modify: `dashboard/src/App.tsx`

- [ ] **Step 1: Write PolicyList sidebar**

Write `dashboard/src/components/policies/policy-list.tsx`:

```tsx
import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import type { PolicySummary } from "@/lib/api/types";

interface PolicyListProps {
  selectedPolicy: string | null;
  onSelect: (name: string) => void;
}

export function PolicyList({ selectedPolicy, onSelect }: PolicyListProps) {
  const [policies, setPolicies] = useState<PolicySummary[]>([]);

  useEffect(() => {
    api.listPolicies().then(setPolicies).catch(() => {});
  }, []);

  async function createPolicy() {
    const name = `new-policy-${Date.now()}`;
    // New policies start from copying the default template
    try {
      const defaultPolicy = await api.getPolicy("default");
      await api.savePolicy(name, { ...defaultPolicy, name } as any);
      setPolicies((prev) => [
        ...prev,
        { name, stages: defaultPolicy.stages, max_revisions: defaultPolicy.max_revisions },
      ]);
      onSelect(name);
    } catch {
      // If default policy does not exist, just select the new name
      onSelect(name);
    }
  }

  return (
    <aside className="w-queue flex flex-col border-r border-border bg-background shrink-0">
      <div className="p-3 border-b border-border flex justify-between items-center">
        <span className="text-xs font-semibold text-text-primary">
          Policies
        </span>
        <button
          onClick={createPolicy}
          className="w-6 h-6 bg-surface border border-border rounded-md flex items-center justify-center cursor-pointer hover:bg-border transition-colors"
          aria-label="Create new policy"
        >
          <Plus className="w-3 h-3 text-text-secondary" />
        </button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1">
          {policies.map((p) => (
            <button
              key={p.name}
              onClick={() => onSelect(p.name)}
              className={cn(
                "w-full text-left px-2 py-2 rounded-md mb-0.5 cursor-pointer transition-colors",
                selectedPolicy === p.name
                  ? "bg-surface border-l-[3px] border-l-active"
                  : "hover:bg-surface/50 border-l-[3px] border-l-transparent"
              )}
            >
              <div className="text-[11px] text-text-primary font-medium">
                {p.name}
              </div>
              <div className="text-[8px] text-text-muted">
                {p.stages.length} stages · {p.max_revisions} revisions max
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}
```

- [ ] **Step 2: Write PipelineFlow visualization**

Write `dashboard/src/components/policies/pipeline-flow.tsx`:

```tsx
import type { Policy } from "@/lib/api/types";

export function PipelineFlow({ policy }: { policy: Policy }) {
  const stages = [
    {
      label: "1. Objective",
      color: "text-stage-objective",
      detail: `${policy.objective.checks.length} checks`,
    },
    {
      label: "2. Subjective",
      color: "text-stage-subjective",
      detail: `${policy.subjective.criteria.length} criteria · threshold ${policy.subjective.pass_threshold}`,
    },
    {
      label: "3. Human",
      color: "text-stage-human",
      detail: `${policy.human.required_reviewers} reviewer · ${policy.human.sla_hours}h SLA`,
    },
  ];

  return (
    <div className="flex items-center gap-0">
      {stages.map((stage, i) => (
        <div key={stage.label} className="flex items-center">
          <div className="bg-surface rounded-lg px-4 py-2.5 border border-border">
            <div className={`text-[11px] font-semibold ${stage.color}`}>
              {stage.label}
            </div>
            <div className="text-[8px] text-text-muted mt-0.5">
              {stage.detail}
            </div>
          </div>
          {i < stages.length - 1 && (
            <span className="text-border px-1">→</span>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write SettingsCard**

Write `dashboard/src/components/policies/settings-card.tsx`:

```tsx
interface SettingsCardProps {
  title: string;
  children: React.ReactNode;
}

export function SettingsCard({ title, children }: SettingsCardProps) {
  return (
    <div className="bg-surface rounded-lg p-3.5">
      <h3 className="text-[11px] text-text-primary font-semibold mb-2.5">
        {title}
      </h3>
      <div className="text-[10px] text-text-secondary leading-relaxed">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write JsonEditor**

Write `dashboard/src/components/policies/json-editor.tsx`:

```tsx
import { useState } from "react";

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function JsonEditor({ value, onChange }: JsonEditorProps) {
  const [error, setError] = useState<string | null>(null);

  function handleChange(raw: string) {
    onChange(raw);
    try {
      JSON.parse(raw);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="flex-1 bg-surface text-text-primary font-mono text-xs p-4 resize-none border-none outline-none"
        spellCheck={false}
      />
      {error && (
        <div className="px-4 py-1.5 bg-stage-rejected/10 text-stage-rejected text-[10px]">
          {error}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write PolicyEditor composing flow + settings cards + JSON editor**

Write `dashboard/src/components/policies/policy-editor.tsx`:

```tsx
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PipelineFlow } from "./pipeline-flow";
import { SettingsCard } from "./settings-card";
import { JsonEditor } from "./json-editor";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import type { Policy } from "@/lib/api/types";

interface PolicyEditorProps {
  policy: Policy;
}

export function PolicyEditor({ policy }: PolicyEditorProps) {
  const [showJson, setShowJson] = useState(false);
  const [rawJson, setRawJson] = useState(policy.raw_json);
  const [saving, setSaving] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Reset rawJson when policy changes (component should also be keyed by policy.name)
  useEffect(() => {
    setRawJson(policy.raw_json);
    setJsonError(null);
    setShowJson(false);
  }, [policy.raw_json]);

  function handleJsonChange(value: string) {
    setRawJson(value);
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
    }
  }

  async function save() {
    setSaving(true);
    try {
      // If JSON view was used, parse and save the edited JSON
      const toSave = showJson && !jsonError ? JSON.parse(rawJson) : policy;
      await api.savePolicy(policy.name, toSave);
      toast.success("Policy saved");
    } catch {
      toast.error("Failed to save policy");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-5">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">
            {policy.name}
          </h2>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowJson(!showJson)}
            className="text-[10px] cursor-pointer"
          >
            {showJson ? "Structured" : "View JSON"}
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={saving || (showJson && !!jsonError)}
            className="bg-active hover:bg-active/90 text-background text-[10px] font-semibold cursor-pointer"
          >
            Save
          </Button>
        </div>
      </div>

      {showJson ? (
        <JsonEditor value={rawJson} onChange={handleJsonChange} />
      ) : (
        <>
          <div className="mb-5">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">
              Review Pipeline
            </div>
            <PipelineFlow policy={policy} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SettingsCard title="Objective Checks">
              {policy.objective.checks.map((check, i) => (
                <div
                  key={i}
                  className="flex justify-between py-0.5 border-b border-background last:border-0"
                >
                  <span>{check.type || check.module}</span>
                  <span
                    className={
                      check.severity === "blocking"
                        ? "text-stage-rejected"
                        : "text-stage-human"
                    }
                  >
                    {check.severity}
                  </span>
                </div>
              ))}
            </SettingsCard>

            <SettingsCard title="Subjective Criteria">
              {policy.subjective.criteria.map((c, i) => (
                <div
                  key={i}
                  className="flex justify-between py-0.5 border-b border-background last:border-0"
                >
                  <span>{c.name}</span>
                  <span>weight: {c.weight.toFixed(2)}</span>
                </div>
              ))}
              <div className="mt-1.5 pt-1 border-t border-border text-text-muted">
                Pass threshold: {policy.subjective.pass_threshold}
              </div>
            </SettingsCard>

            <SettingsCard title="Human Review">
              <div>
                Strategy: <span className="text-text-primary">{policy.human.assignment_strategy}</span>
              </div>
              <div>
                Reviewers: <span className="text-text-primary">{policy.human.required_reviewers}</span>
              </div>
              <div>
                SLA: <span className="text-text-primary">{policy.human.sla_hours}h</span>
              </div>
            </SettingsCard>

            <SettingsCard title="Revision Settings">
              <div>
                Max revisions: <span className="text-text-primary">{policy.max_revisions}</span>
              </div>
              <div>
                Mode: <span className="text-text-primary">{policy.revision_handling.mode}</span>
              </div>
              {policy.revision_handling.max_auto_revisions != null && (
                <div>
                  Auto revisions: <span className="text-text-primary">{policy.revision_handling.max_auto_revisions}</span>
                </div>
              )}
              {policy.revision_handling.escalate_after_auto_fail != null && (
                <div>
                  Escalate on fail: <span className="text-text-primary">{policy.revision_handling.escalate_after_auto_fail ? "Yes" : "No"}</span>
                </div>
              )}
            </SettingsCard>

            <SettingsCard title="Notifications">
              {policy.default_notifications.length > 0 ? (
                policy.default_notifications.map((n, i) => (
                  <div key={i} className="mb-1">
                    <div>
                      Driver: <span className="text-text-primary">{n.driver}</span>
                    </div>
                    <div>
                      Events: <span className="text-text-primary">{n.events.join(", ")}</span>
                    </div>
                  </div>
                ))
              ) : (
                <span className="text-text-muted">No default notifications</span>
              )}
            </SettingsCard>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Write PoliciesPage**

Write `dashboard/src/pages/policies-page.tsx`:

```tsx
import { useState, useEffect } from "react";
import { PolicyList } from "@/components/policies/policy-list";
import { PolicyEditor } from "@/components/policies/policy-editor";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import type { Policy } from "@/lib/api/types";

export function PoliciesPage() {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedName) {
      setLoading(true);
      api
        .getPolicy(selectedName)
        .then(setPolicy)
        .catch(() => toast.error("Failed to load policy"))
        .finally(() => setLoading(false));
    }
  }, [selectedName]);

  return (
    <div className="flex h-full">
      <PolicyList
        selectedPolicy={selectedName}
        onSelect={setSelectedName}
      />
      <div className="flex-1 min-w-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-text-muted">Loading...</p>
          </div>
        ) : policy ? (
          <PolicyEditor key={policy.name} policy={policy} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-text-muted">
              Select a policy to edit
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Update App.tsx to use PoliciesPage**

Replace the placeholder `PoliciesPage` in `App.tsx` with an import from `@/pages/policies-page`.

- [ ] **Step 8: Verify policies manager**

```bash
cd dashboard
npm run dev
```

Navigate to `/policies`. Expected: policy list on left, click to load editor, pipeline flow visualization at top, settings cards in 2-column grid, View JSON toggle shows raw JSON.

- [ ] **Step 9: Commit**

```bash
git add dashboard/src/components/policies/ dashboard/src/pages/policies-page.tsx dashboard/src/App.tsx
git commit -m "feat(dashboard): add policies manager with structured editor and JSON toggle"
```

---

### Task 16: Responsive Layout

**Files:**
- Modify: `dashboard/src/components/shell/layout.tsx`
- Modify: `dashboard/src/components/shell/icon-rail.tsx`
- Modify: `dashboard/src/components/review/queue-sidebar.tsx`
- Modify: `dashboard/src/components/review/context-panel.tsx`
- Modify: `dashboard/src/pages/review-page.tsx`
- Modify: `dashboard/src/pages/pipeline-page.tsx`

- [ ] **Step 1: Add mobile bottom tab bar to IconRail**

Update `dashboard/src/components/shell/icon-rail.tsx`. Add a mobile-only bottom tab bar below the existing desktop nav. The desktop `<nav>` gets `hidden md:flex`. The new mobile bar uses `md:hidden fixed bottom-0 left-0 right-0 z-50`:

```tsx
// After the existing desktop <nav> (add className="hidden md:flex ..." to it), add:
<nav
  className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-14 bg-background border-t border-border flex items-center justify-around px-4"
  aria-label="Main navigation"
>
  {navItems.map(({ path, icon: Icon, label }) => {
    const isActive = location.pathname.startsWith(path);
    return (
      <button
        key={path}
        onClick={() => navigate(path)}
        className={cn(
          "flex flex-col items-center gap-0.5 py-1 px-3 cursor-pointer",
          isActive ? "text-active" : "text-text-muted"
        )}
        aria-label={label}
        aria-current={isActive ? "page" : undefined}
      >
        <Icon className="w-5 h-5" />
        <span className="text-[9px]">{label}</span>
      </button>
    );
  })}
</nav>
```

- [ ] **Step 2: Update Layout for responsive**

Update `dashboard/src/components/shell/layout.tsx`:
- Wrap the `<IconRail />` in a div with `hidden md:flex` to hide the desktop rail on mobile
- Add `pb-14 md:pb-0` to the `<main>` element to account for the mobile bottom tab bar

```tsx
<div className="h-screen flex flex-col overflow-hidden">
  <TopBar connectionStatus={connectionStatus} onRetry={onRetry} />
  <div className="flex flex-1 min-h-0">
    <div className="hidden md:flex">
      <IconRail />
    </div>
    <main className="flex-1 min-w-0 pb-14 md:pb-0">
      <Outlet />
    </main>
  </div>
</div>
```

- [ ] **Step 3: Make QueueSidebar responsive**

Update `dashboard/src/components/review/queue-sidebar.tsx`. Accept an `onClose` prop for mobile. On mobile, render as a full-screen overlay; on desktop, render as the fixed-width sidebar:

```tsx
interface QueueSidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

export function QueueSidebar({ isOpen, onClose }: QueueSidebarProps) {
  // ... existing state and filtering logic ...

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile: full-screen overlay */}
      <aside className="md:hidden fixed inset-0 z-40 flex flex-col bg-background">
        <div className="p-3 border-b border-border flex justify-between items-center">
          <span className="text-xs font-semibold text-text-primary">Review Queue</span>
          {onClose && (
            <button onClick={onClose} className="text-text-muted cursor-pointer" aria-label="Close queue">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {/* ... search, filters, scroll area (same as desktop) ... */}
      </aside>

      {/* Desktop: fixed-width sidebar */}
      <aside className="hidden md:flex w-queue flex-col border-r border-border bg-background shrink-0">
        {/* ... existing desktop content ... */}
      </aside>
    </>
  );
}
```

Import `X` from `lucide-react`. On mobile, tapping a queue item should call `onClose` after selecting, so the content area is visible.

- [ ] **Step 4: Make ContextPanel responsive**

Update `dashboard/src/components/review/context-panel.tsx`. On mobile, render as a collapsible section above the decision bar instead of a side panel:

```tsx
export function ContextPanel({ deliverable, isOpen, activeTab, onTabChange }: ContextPanelProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Mobile: horizontal section above decision bar */}
      <div className="md:hidden border-t border-border max-h-[40vh] overflow-y-auto">
        <Tabs value={activeTab} onValueChange={onTabChange} className="flex flex-col">
          {/* Same TabsList and TabsContent as desktop */}
        </Tabs>
      </div>

      {/* Desktop: fixed-width right panel */}
      <aside className="hidden md:flex w-context flex-col border-l border-border shrink-0">
        <Tabs value={activeTab} onValueChange={onTabChange} className="flex flex-col flex-1 min-h-0">
          {/* Same TabsList and TabsContent */}
        </Tabs>
      </aside>
    </>
  );
}
```

- [ ] **Step 5: Make Pipeline and Policies pages responsive**

Update `dashboard/src/pages/pipeline-page.tsx`:
- Stage count cards: use `flex-wrap` (already set) — on mobile they naturally stack
- Deliverable table: wrap in a `overflow-x-auto` container for horizontal scrolling on mobile

Update `dashboard/src/pages/policies-page.tsx`:
- On mobile, use the same pattern as Queue: policy list is the primary view, tapping opens the editor full-screen

- [ ] **Step 6: Verify responsive behavior**

```bash
cd dashboard
npm run dev
```

Test at three breakpoints:
- **Mobile (< 768px):** Bottom tab bar, queue as full-screen list, context as collapsible section, pipeline cards stack, policies list as primary screen
- **Tablet (768-1023px):** Icon rail visible, queue as sidebar, context panel visible
- **Desktop (>= 1024px):** Full three-column layout

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/
git commit -m "feat(dashboard): add responsive layout with mobile tab bar and slide-over panels"
```

---

### Task 17: Final Verification + Build

- [ ] **Step 1: Run type check**

```bash
cd dashboard
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 2: Run build**

```bash
cd dashboard
npm run build
```

Expected: build succeeds, `dist/` directory created with static files.

- [ ] **Step 3: Preview production build**

```bash
cd dashboard
npm run preview
```

Navigate to http://localhost:4173. Verify all three views work (Review, Pipeline, Policies), dark/light toggle works, keyboard shortcuts work.

- [ ] **Step 4: Commit any fixes**

If any type errors or build issues required code changes, commit those fixes:

```bash
git add dashboard/src/
git commit -m "fix(dashboard): resolve type errors and build issues from final verification"
```

Skip this step if no changes were needed.
