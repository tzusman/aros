export type Stage = "draft" | "objective" | "subjective" | "human" | "approved" | "rejected" | "revision_requested";
export type FolderStrategy = "all_pass" | "select" | "rank" | "categorize";
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
    file: string | null;
    location: string;
    category: string;
    severity: "critical" | "major" | "minor";
    description: string;
    suggestion: string;
}
export interface Feedback {
    stage: string;
    decision: "revision_requested" | "rejected";
    summary: string;
    issues: FeedbackIssue[];
    reviewer: string;
    timestamp: string;
}
export interface DeliverableMeta {
    title: string;
    brief: string;
    policy: string;
    source_agent: string;
    content_type: string;
    folder_strategy?: FolderStrategy;
    notification?: NotificationConfig;
}
export interface DeliverableStatus {
    stage: Stage;
    score: number | null;
    revision_number: number;
    entered_stage_at: string;
    submitted_at: string;
    rejecting_stage: Stage | null;
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
export interface RevisionEntry {
    version: number;
    summary: string;
    feedback: Feedback | null;
    timestamp: string;
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
    folder_strategy: FolderStrategy | null;
}
export interface DecisionPayload {
    decision: Decision;
    reason?: string;
}
export interface NotificationConfig {
    driver: string;
    target: Record<string, unknown>;
    events: string[];
}
export interface PolicyObjectiveCheck {
    name: string;
    config: Record<string, unknown>;
    severity: "blocking" | "warning";
}
export interface PolicySubjectiveCriterion {
    name: string;
    description: string;
    weight: number;
    scale: number;
}
export interface PolicyConfig {
    name: string;
    stages: Stage[];
    max_revisions: number;
    objective?: {
        checks: PolicyObjectiveCheck[];
        fail_threshold: number;
    };
    subjective?: {
        criteria: PolicySubjectiveCriterion[];
        pass_threshold: number;
    };
    human?: {
        required: boolean;
    };
}
export interface PipelineCounts {
    in_progress: number;
    pending_human: number;
    awaiting_revisions: number;
    approved_72h: number;
    rejected_72h: number;
}
export type SSEEventType = "deliverable:submitted" | "deliverable:stage_changed" | "deliverable:decided" | "deliverable:revised";
export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";
//# sourceMappingURL=index.d.ts.map