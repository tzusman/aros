// ---- as const arrays with derived union types ----
// Runtime-iterable AND type-safe. Use in Zod schemas, UI dropdowns, etc.

export const STAGES = [
  "draft",
  "objective",
  "subjective",
  "human",
  "approved",
  "rejected",
  "revision_requested",
] as const;
export type Stage = (typeof STAGES)[number];

export const FOLDER_STRATEGIES = ["all_pass", "select", "rank", "categorize"] as const;
export type FolderStrategy = (typeof FOLDER_STRATEGIES)[number];

export const DECISIONS = ["approved", "revision_requested", "rejected"] as const;
export type Decision = (typeof DECISIONS)[number];

export const SEVERITIES = ["blocking", "warning"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const FEEDBACK_SEVERITIES = ["critical", "major", "minor"] as const;
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number];

export const FILE_STATUSES = ["passed", "failed", "revision_requested"] as const;
export type FileStatus = (typeof FILE_STATUSES)[number];

export const SSE_EVENT_TYPES = [
  "deliverable:submitted",
  "deliverable:stage_changed",
  "deliverable:decided",
  "deliverable:revised",
] as const;
export type SSEEventType = (typeof SSE_EVENT_TYPES)[number];

export const CONNECTION_STATUSES = ["connected", "reconnecting", "disconnected"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const NOTIFICATION_EVENTS = ["approved", "revision_requested", "rejected"] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];
