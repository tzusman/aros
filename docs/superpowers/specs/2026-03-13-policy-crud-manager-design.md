# Policy CRUD Manager

**Date:** 2026-03-13
**Status:** Approved

## Overview

A full CRUD manager for AROS review policies, embedded in the existing policies page. Users can create, view, edit, and delete policies with visual inline editing of checks, criteria, and settings. Policies can import checks and criteria from the registry, and users can create custom criteria directly in the UI. Custom checks require code and are created in the filesystem, with UI guidance.

## Decisions

- **Checks are read-only in the UI.** Users can browse and import registry checks into a policy, but creating new checks requires writing code. The UI provides instructions and a downloadable template.
- **Criteria are full CRUD in the UI.** Users can create, edit, and delete custom criteria with name, description, weight, scale, prompt guidance, and applicable content types.
- **Custom criteria are stored as modules** in `.aros/modules/criteria/{name}/manifest.json`, the same format as installed registry criteria. Policies reference them by name. This enables reuse across policies.
- **Policy creation uses a template picker + clone flow.** Templates: Blank, Basic (objective + human), Full Pipeline (objective + subjective + human). Users can also clone any existing installed policy.
- **Editor layout enhances in place.** The existing sidebar + editor panel layout is kept. The read-only visual cards are replaced with editable inline forms. Modular component rebuild (Approach B).
- **Import uses modal pickers.** Clicking "+ Import check" or "+ Import criterion" opens a searchable modal listing registry items. Already-added items are grayed out.
- **Human review is a simple toggle.** On or off — no strategy/reviewers/SLA settings. Policies with existing rich `PolicyHumanConfig` data will have those fields preserved on save (the toggle only controls `human.required`; other fields pass through).
- **Delete confirmation includes git warning.** "If this policy has not been committed to git, this cannot be undone."
- **The editor works with `PolicyConfig`** (the narrow type). Fields like `evaluation_model`, `revision_handling`, `default_notifications`, and `raw_json` from the broader `Policy` type are not editable in the visual editor. The JSON mode still allows editing the full payload. Extra fields present in the JSON are preserved on save because the server's PUT route uses a raw cast (`req.body as PolicyConfig`) without Zod validation — it passes the full body through to `JSON.stringify`. **Implementation note:** the PUT route must NOT add `policyConfigSchema.parse()` or `policyBody.parse()` validation, as these would strip extra fields. If validation is added in the future, use `.passthrough()` on the Zod schemas.
- **Policy creation uses `PUT` (upsert).** There is no separate `POST` endpoint. The create modal constructs the template defaults client-side and saves via `api.savePolicy()` which calls `PUT /api/policies/:name`.

## Editor Layout

The editor panel has these zones top to bottom:

### Header Bar
- Policy name (display only after creation)
- Stage count badge
- JSON toggle button (switches to raw JSON editor, same as today)
- Save button
- Delete button (with confirmation dialog)

### Settings Bar
- Stage pipeline: pills for each stage with arrows between them, "+ stage" button to add stages
- Max revisions: number input
- Fail threshold: number input (for objective stage)

### Objective Checks Section
- Section header: "Objective Checks" with count badge and "+ Import check" button
- List of checks, each showing:
  - Name
  - Severity badge (blocking/warning)
  - Config preview in monospace (e.g., `max_mb: 10`)
  - Gear button: expands inline config editor below the row (config fields from schema + severity dropdown)
  - Remove button
- Below the list: instruction text explaining how to create custom checks with a downloadable template link

### Subjective Criteria Section
- Section header: "Subjective Criteria" with count badge, "+ Import criterion" button, and "+ Create new" button
- Pass threshold: number input with scale display
- List of criteria, each showing:
  - Name
  - Source badge ("registry" or "custom") — determined by checking the criterion name against the registry catalog; if present in registry, show "registry", otherwise "custom"
  - Description text
  - Weight display
  - Gear button: for registry criteria, inline weight edit only; for custom criteria, opens the full criterion form modal
  - Remove button

### Human Review Section
- Toggle switch: "Require human review before final approval"

## Import Modal

Shared modal component used for both checks and criteria import:

- Header: "Import Check from Registry" or "Import Criterion from Registry"
- Search input: filters by name and description
- Scrollable list of registry items showing:
  - Name and version
  - Description
  - Content type tags (criteria only)
  - "+ Add" button, or "already added" label if already in the policy
- "Done" button to close
- Clicking "+ Add" immediately adds the item to the policy state (no separate confirm)
- The modal receives the current policy's check/criteria name lists as props to determine "already added" state

## Criteria Form Modal

Used for creating and editing custom criteria:

### Fields
- **Name** — text input, required, lowercase-with-hyphens, must be unique
- **Description** — textarea, required, what the AI reviewer evaluates
- **Default Weight** — number input, required, positive
- **Scale** — number input, required, positive, default 10
- **Prompt Guidance** — textarea, required, detailed scoring rubric for the AI (required by `criterionManifestSchema`)
- **Applicable To** — tag input, required (min 1), MIME type patterns (e.g., `image/*`, `text/*`)

Note: `version` is auto-set to `"1.0.0"` on create and preserved on edit. `type` is always `"criterion"`. These are not user-editable but are written to the manifest to satisfy the `criterionManifestSchema` validation.

### Behavior
- On create: saves to `.aros/modules/criteria/{name}/manifest.json` (with `type: "criterion"` and `version: "1.0.0"`) and adds to current policy
- On edit: pre-fills all fields, saves updates to the manifest
- Cancel discards changes

### Validation
- Name: lowercase letters and hyphens only, no duplicates against existing custom modules OR registry criteria (prevents name collisions that would confuse source badge logic)
- Description: non-empty
- Weight: positive number
- Scale: positive number
- Prompt Guidance: non-empty
- Applicable To: at least one entry
- Errors shown inline below each field

## Policy Creation Flow

Triggered by clicking "+" in the sidebar. Opens a modal with:

### Name Input
- Policy name field with validation (lowercase, hyphens, unique against existing policies)

### Template Section
Three built-in templates (defaults constructed client-side):
- **Blank** — empty policy: `{ name, stages: [], max_revisions: 1 }`
- **Basic** — objective + human stages: `{ name, stages: ["objective", "human"], max_revisions: 3, objective: { checks: [], fail_threshold: 1 }, human: { required: true } }`
- **Full Pipeline** — all three stages: `{ name, stages: ["objective", "subjective", "human"], max_revisions: 3, objective: { checks: [], fail_threshold: 1 }, subjective: { criteria: [], pass_threshold: 6 }, human: { required: true } }`

### Clone Section
- Dynamically lists all installed policies
- Shows summary: check count, criteria count, stage count
- Deep-copies the entire policy config with the new name

### Save
Creation uses the existing `PUT /api/policies/:name` endpoint via `api.savePolicy()`. No new endpoint needed.

## Component Architecture

```
dashboard/src/components/policies/
├── policy-list.tsx          (modify — add create modal trigger)
├── policy-editor.tsx        (rewrite — thin orchestrator holding mutable PolicyConfig state)
├── json-editor.tsx          (unchanged)
├── pipeline-flow.tsx        (remove — replaced by policy-settings-bar stage pills)
├── settings-card.tsx        (remove — replaced by policy-settings-bar)
├── policy-settings-bar.tsx  (new — stages, max revisions, fail threshold)
├── check-list.tsx           (new — objective checks list with add/remove/configure)
├── check-config-inline.tsx  (new — inline config expansion for a check)
├── criteria-list.tsx        (new — subjective criteria list with add/remove/configure)
├── criteria-form-modal.tsx  (new — create/edit custom criterion modal)
├── import-modal.tsx         (new — shared modal for importing checks or criteria from registry)
├── create-policy-modal.tsx  (new — name + template/clone picker)
└── delete-confirm-dialog.tsx(new — delete confirmation with git warning)
```

### Data Flow
- `PolicyEditor` holds the mutable policy state (typed as `PolicyConfig` with a pass-through bag for extra fields) and a `dirty` flag
- Child components receive the policy + callbacks to mutate it (e.g., `onAddCheck`, `onRemoveCheck`, `onUpdateConfig`)
- Save button in `PolicyEditor` merges the edited `PolicyConfig` fields back with any pass-through fields and sends to `api.savePolicy()`
- Import modals fetch from `api.getRegistryCatalog()` and receive the current policy's check/criteria name lists as props to filter out already-added items
- Criteria CRUD hits new API endpoints
- Source badge ("registry" vs "custom") is determined by comparing the criterion name against the registry catalog fetched for the import modal

### New API Endpoints

```
GET    /api/criteria          — list all custom criteria modules from .aros/modules/criteria/
POST   /api/criteria          — create custom criterion (writes manifest.json with type + version)
PUT    /api/criteria/:name    — update custom criterion manifest
DELETE /api/criteria/:name    — delete custom criterion module directory
```

These return/accept `CriterionManifest` shape (name, type, version, description, applicableTo, defaultWeight, scale, promptGuidance). This is distinct from `/api/registry/criteria` which lists bundled registry criteria. The import modal uses the registry endpoint; the criteria form modal uses the custom criteria endpoints.

Implementation requires:
- New file: `server/src/routes/criteria.ts` with the route handlers
- Mount in `server/src/index.ts` at `/api/criteria`
- New API client methods in `dashboard/src/lib/api/client.ts`: `listCustomCriteria()`, `createCriterion()`, `updateCriterion()`, `deleteCriterion()`

Existing endpoints used:
- `GET /api/registry` — fetch registry catalog for import modals
- `GET /api/policies`, `GET /api/policies/:name`, `PUT /api/policies/:name`, `DELETE /api/policies/:name` — existing policy CRUD

### Check Template Download
- Bundle the check template as a static asset in the dashboard (`public/check-template.ts`)
- The UI links directly to the static file for download — no new server route needed

## Out of Scope
- Custom check creation in the UI (requires code — filesystem only)
- Drag-and-drop reordering of checks/criteria
- Policy versioning or history
- Rich human review config (assignment strategy, SLA, reviewers)
- Editing `evaluation_model`, `revision_handling`, `default_notifications` in visual mode (use JSON mode)
