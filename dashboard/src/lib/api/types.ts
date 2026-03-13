// --- Deliverable ---

export type Stage =
  | "draft"
  | "objective"
  | "subjective"
  | "human"
  | "revision_requested"
  | "approved"
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
  file: string | null;
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
  size_bytes: number;
  preview_url?: string;
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
  objective?: {
    checks: PolicyObjectiveCheck[];
    fail_threshold: number;
  };
  subjective?: {
    evaluation_model?: string;
    criteria: PolicySubjectiveCriterion[];
    pass_threshold: number;
    require_rationale?: boolean;
  };
  human?: { required: boolean } | PolicyHumanConfig;
  revision_handling?: {
    mode: "auto_revise" | "hybrid" | "manual";
    max_auto_revisions?: number;
    escalate_after_auto_fail?: boolean;
  };
  default_notifications?: Array<{
    driver: string;
    target: Record<string, unknown>;
    events: string[];
  }>;
  raw_json?: string;
}

// --- SSE Events ---

export type SSEEventType =
  | "deliverable:submitted"
  | "deliverable:stage_changed"
  | "deliverable:decided"
  | "deliverable:revised"
  | "fs:changed";

export interface SSEEvent {
  type: SSEEventType;
  data: Record<string, unknown>;
}

// --- Connection ---

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

// --- Custom Criteria ---

export interface CustomCriterion {
  name: string;
  type: "criterion";
  version: string;
  description: string;
  applicableTo: string[];
  defaultWeight: number;
  scale: number;
  promptGuidance: string;
}
