import type {
  Deliverable,
  DeliverableSummary,
  DecisionPayload,
  PipelineCounts,
  Policy,
  PolicySummary,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay<T>(value: T, ms = 100): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// ---------------------------------------------------------------------------
// Mock Deliverable Summaries
// ---------------------------------------------------------------------------

const summaries: DeliverableSummary[] = [
  {
    id: "d-20260310-001",
    title: "Q1 Product Launch Blog Post",
    source_agent: "content-writer-v3",
    policy: "blog-post",
    content_type: "text/markdown",
    stage: "human",
    score: 7.2,
    entered_stage_at: "2026-03-10T14:30:00Z",
    submitted_at: "2026-03-10T13:00:00Z",
    revision_number: 1,
    is_folder: false,
    file_count: null,
  },
  {
    id: "d-20260310-002",
    title: "REST API Reference — Users Endpoint",
    source_agent: "doc-gen-v2",
    policy: "default",
    content_type: "text/markdown",
    stage: "human",
    score: 8.1,
    entered_stage_at: "2026-03-10T15:10:00Z",
    submitted_at: "2026-03-10T12:45:00Z",
    revision_number: 2,
    is_folder: false,
    file_count: null,
  },
  {
    id: "d-20260310-003",
    title: "Internal Code Review — Auth Module",
    source_agent: "code-reviewer-v1",
    policy: "code-review",
    content_type: "text/markdown",
    stage: "subjective",
    score: null,
    entered_stage_at: "2026-03-10T16:00:00Z",
    submitted_at: "2026-03-10T15:50:00Z",
    revision_number: 1,
    is_folder: false,
    file_count: null,
  },
  {
    id: "d-20260310-004",
    title: "Spring Campaign Ad Creatives",
    source_agent: "creative-gen-v2",
    policy: "ad-creative-review",
    content_type: "image/png",
    stage: "objective",
    score: null,
    entered_stage_at: "2026-03-10T16:20:00Z",
    submitted_at: "2026-03-10T16:15:00Z",
    revision_number: 1,
    is_folder: true,
    file_count: 4,
  },
  {
    id: "d-20260310-005",
    title: "Weekly Engineering Newsletter",
    source_agent: "content-writer-v3",
    policy: "default",
    content_type: "text/markdown",
    stage: "approved",
    score: 8.4,
    entered_stage_at: "2026-03-10T11:00:00Z",
    submitted_at: "2026-03-10T09:00:00Z",
    revision_number: 1,
    is_folder: false,
    file_count: null,
  },
  {
    id: "d-20260310-006",
    title: "Onboarding Guide v2 — Getting Started",
    source_agent: "doc-gen-v2",
    policy: "default",
    content_type: "text/markdown",
    stage: "revision_requested",
    score: 5.3,
    entered_stage_at: "2026-03-10T10:30:00Z",
    submitted_at: "2026-03-10T08:00:00Z",
    revision_number: 1,
    is_folder: false,
    file_count: null,
  },
];

// ---------------------------------------------------------------------------
// Full Deliverables (content + results)
// ---------------------------------------------------------------------------

const fullDeliverables: Record<string, Deliverable> = {
  "d-20260310-001": {
    ...summaries[0],
    content: `# Introducing AcmeCo Platform 3.0

We're thrilled to announce the general availability of **AcmeCo Platform 3.0**, the most significant update to our developer tooling in over two years.

## What's New

### Unified Dashboard
The new dashboard consolidates monitoring, deployments, and team management into a single view. No more context-switching between tabs.

### Real-Time Collaboration
Multiple team members can now edit configurations simultaneously with conflict-free resolution powered by CRDTs.

### Performance
Cold-start times have been reduced by **62%** across all regions, and our P99 latency is now under 45ms globally.

## Migration Path

Existing customers on Platform 2.x can upgrade in-place with zero downtime using our migration CLI:

\`\`\`bash
acmeco migrate --to 3.0 --dry-run
acmeco migrate --to 3.0 --confirm
\`\`\`

Read the full migration guide at [docs.acmeco.dev/migrate](https://docs.acmeco.dev/migrate).

## Get Started

Platform 3.0 is available today for all plans. Log in to your dashboard to explore the new features.`,
    brief:
      "Write a launch blog post for AcmeCo Platform 3.0 highlighting the unified dashboard, real-time collaboration, and performance improvements. Tone should be professional yet enthusiastic.",
    objective_results: [
      {
        name: "word_count",
        passed: true,
        severity: "warning",
        details: "172 words — within 100-500 word target range.",
      },
      {
        name: "broken_links",
        passed: true,
        severity: "blocking",
        details: "All 2 links are well-formed.",
      },
      {
        name: "profanity_check",
        passed: true,
        severity: "blocking",
        details: "No profanity detected.",
      },
      {
        name: "reading_level",
        passed: true,
        severity: "warning",
        details: "Flesch-Kincaid grade level 8.3 — target <=10.",
      },
    ],
    subjective_results: [
      {
        name: "Clarity",
        score: 7.5,
        weight: 0.3,
        scale: 10,
        rationale:
          "The post clearly explains the three headline features and provides a concrete migration path. Some sections could benefit from more specific examples.",
      },
      {
        name: "Tone & Voice",
        score: 7.0,
        weight: 0.25,
        scale: 10,
        rationale:
          "Professional and appropriately enthusiastic. The opening could feel slightly more conversational to match the brand voice guide.",
      },
      {
        name: "Completeness",
        score: 7.2,
        weight: 0.25,
        scale: 10,
        rationale:
          "Covers key features and migration well. Missing pricing impact section and customer testimonial that the brief suggested including.",
      },
      {
        name: "Engagement",
        score: 7.0,
        weight: 0.2,
        scale: 10,
        rationale:
          "Good use of formatting and code blocks. The CTA is clear but could be more compelling with a specific incentive.",
      },
    ],
    feedback: null,
    history: [],
    files: null,
    folder_strategy: null,
  },

  "d-20260310-002": {
    ...summaries[1],
    content: `# Users Endpoint

## List Users

\`GET /api/v1/users\`

Returns a paginated list of users in the organization.

### Query Parameters

| Parameter | Type   | Default | Description              |
|-----------|--------|---------|--------------------------|
| page      | int    | 1       | Page number              |
| per_page  | int    | 25      | Items per page (max 100) |
| role      | string | —       | Filter by role           |
| status    | string | active  | Filter by account status |

### Response

\`\`\`json
{
  "data": [
    {
      "id": "usr_a1b2c3",
      "email": "jane@example.com",
      "name": "Jane Smith",
      "role": "admin",
      "created_at": "2025-11-02T08:30:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "per_page": 25,
    "total": 142
  }
}
\`\`\`

### Errors

| Status | Description           |
|--------|-----------------------|
| 401    | Authentication failed |
| 403    | Insufficient scope    |

## Get User

\`GET /api/v1/users/:id\`

Returns a single user by ID.`,
    brief:
      "Generate API reference documentation for the Users endpoint, covering list and get operations with parameter tables, example responses, and error codes.",
    objective_results: [
      {
        name: "markdown_lint",
        passed: true,
        severity: "warning",
        details: "No markdown lint errors.",
      },
      {
        name: "code_block_syntax",
        passed: true,
        severity: "blocking",
        details: "All code blocks have valid language tags and parse correctly.",
      },
      {
        name: "endpoint_consistency",
        passed: true,
        severity: "blocking",
        details: "All endpoints follow the /api/v1/ prefix convention.",
      },
    ],
    subjective_results: [
      {
        name: "Accuracy",
        score: 8.5,
        weight: 0.35,
        scale: 10,
        rationale:
          "Endpoint paths, parameter types, and response schema are consistent with the existing API surface. Pagination meta matches the standard.",
      },
      {
        name: "Completeness",
        score: 7.8,
        weight: 0.3,
        scale: 10,
        rationale:
          "List and Get endpoints well documented. Missing PATCH/DELETE operations that the brief implied should be included.",
      },
      {
        name: "Clarity",
        score: 8.2,
        weight: 0.2,
        scale: 10,
        rationale:
          "Well-structured with clear tables and examples. Parameter descriptions are concise and unambiguous.",
      },
      {
        name: "Developer Experience",
        score: 7.9,
        weight: 0.15,
        scale: 10,
        rationale:
          "Good use of tables and code examples. Could include a curl example for quicker onboarding.",
      },
    ],
    feedback: {
      stage: "subjective",
      decision: "revision_requested",
      summary:
        "Documentation quality is high but incomplete — only covers GET operations. The brief requested full CRUD coverage.",
      issues: [
        {
          category: "completeness",
          description: "Missing PATCH and DELETE endpoint documentation.",
          location: "document",
          severity: "major",
          suggestion:
            "Add ## Update User and ## Delete User sections with the same level of detail.",
        },
      ],
      reviewer: "aros-subjective",
      timestamp: "2026-03-10T14:00:00Z",
    },
    history: [
      {
        version: 1,
        summary:
          "Initial draft covering only GET /users and GET /users/:id. Sent back for revision due to missing CRUD operations.",
        feedback: {
          stage: "subjective",
          decision: "revision_requested",
          summary:
            "Only GET operations were documented. Brief requested full CRUD coverage.",
          issues: [
            {
              category: "completeness",
              description:
                "Missing PATCH and DELETE endpoint documentation.",
              location: "document",
              severity: "major",
              suggestion:
                "Add sections for Update User and Delete User.",
            },
          ],
          reviewer: "aros-subjective",
          timestamp: "2026-03-10T14:00:00Z",
        },
        timestamp: "2026-03-10T12:45:00Z",
      },
    ],
    files: null,
    folder_strategy: null,
  },

  "d-20260310-004": {
    ...summaries[3],
    content: "[Folder deliverable — individual files listed below]",
    brief:
      "Generate four ad creative variations for the Spring 2026 campaign. Each should feature the product on a pastel background with the tagline 'Bloom into savings.' Aspect ratio 1:1, 1080x1080px.",
    objective_results: [
      {
        name: "image_dimensions",
        passed: true,
        severity: "blocking",
        details: "All 4 images are 1080x1080px as required.",
      },
      {
        name: "file_size",
        passed: true,
        severity: "warning",
        details: "All files under 2MB limit. Largest: 1.4MB.",
      },
      {
        name: "format_check",
        passed: true,
        severity: "blocking",
        details: "All files are valid PNG format.",
      },
      {
        name: "brand_colors",
        passed: false,
        severity: "warning",
        details:
          "Variant 3 uses #FF6B35 which is outside the approved Spring palette.",
      },
    ],
    subjective_results: null,
    feedback: null,
    history: [],
    files: [
      {
        filename: "spring-ad-variant-1.png",
        content_type: "image/png",
        objective_results: [
          {
            name: "image_dimensions",
            passed: true,
            severity: "blocking",
            details: "1080x1080px.",
          },
          {
            name: "brand_colors",
            passed: true,
            severity: "warning",
            details: "All colors within approved palette.",
          },
        ],
        subjective_results: null,
        score: null,
        status: "passed",
      },
      {
        filename: "spring-ad-variant-2.png",
        content_type: "image/png",
        objective_results: [
          {
            name: "image_dimensions",
            passed: true,
            severity: "blocking",
            details: "1080x1080px.",
          },
          {
            name: "brand_colors",
            passed: true,
            severity: "warning",
            details: "All colors within approved palette.",
          },
        ],
        subjective_results: null,
        score: null,
        status: "passed",
      },
      {
        filename: "spring-ad-variant-3.png",
        content_type: "image/png",
        objective_results: [
          {
            name: "image_dimensions",
            passed: true,
            severity: "blocking",
            details: "1080x1080px.",
          },
          {
            name: "brand_colors",
            passed: false,
            severity: "warning",
            details: "#FF6B35 is outside the approved Spring palette.",
          },
        ],
        subjective_results: null,
        score: null,
        status: "passed",
      },
      {
        filename: "spring-ad-variant-4.png",
        content_type: "image/png",
        objective_results: [
          {
            name: "image_dimensions",
            passed: true,
            severity: "blocking",
            details: "1080x1080px.",
          },
          {
            name: "brand_colors",
            passed: true,
            severity: "warning",
            details: "All colors within approved palette.",
          },
        ],
        subjective_results: null,
        score: null,
        status: "passed",
      },
    ],
    folder_strategy: "all_pass",
  },
};

// ---------------------------------------------------------------------------
// Mock Policies
// ---------------------------------------------------------------------------

const policies: Record<string, Policy> = {
  default: {
    name: "default",
    stages: ["objective", "subjective", "human"],
    max_revisions: 3,
    objective: {
      checks: [
        {
          type: "word_count",
          config: { min: 50, max: 2000 },
          severity: "warning",
        },
        {
          type: "profanity_check",
          config: {},
          severity: "blocking",
        },
        {
          type: "broken_links",
          config: { timeout_ms: 5000 },
          severity: "blocking",
        },
      ],
      fail_threshold: 1,
    },
    subjective: {
      evaluation_model: "claude-sonnet-4-20250514",
      criteria: [
        {
          name: "Clarity",
          description: "Is the content clear, well-organized, and easy to follow?",
          weight: 0.3,
          scale: 10,
        },
        {
          name: "Completeness",
          description: "Does the content fully address the brief?",
          weight: 0.3,
          scale: 10,
        },
        {
          name: "Tone & Voice",
          description: "Does the tone match the target audience and brand guidelines?",
          weight: 0.2,
          scale: 10,
        },
        {
          name: "Engagement",
          description: "Is the content compelling and likely to hold reader attention?",
          weight: 0.2,
          scale: 10,
        },
      ],
      pass_threshold: 7.0,
      require_rationale: true,
    },
    human: {
      assignment_strategy: "round_robin",
      required_reviewers: 1,
      consensus_rule: "any_approve",
      sla_hours: 24,
      show_ai_reviews: true,
    },
    revision_handling: {
      mode: "hybrid",
      max_auto_revisions: 2,
      escalate_after_auto_fail: true,
    },
    default_notifications: [
      {
        driver: "slack",
        target: { channel: "#content-review" },
        events: ["deliverable:submitted", "deliverable:decided"],
      },
    ],
    raw_json: "{}",
  },

  "blog-post": {
    name: "blog-post",
    stages: ["objective", "subjective", "human"],
    max_revisions: 2,
    objective: {
      checks: [
        {
          type: "word_count",
          config: { min: 100, max: 500 },
          severity: "warning",
        },
        {
          type: "reading_level",
          config: { max_grade: 10 },
          severity: "warning",
        },
        {
          type: "broken_links",
          config: { timeout_ms: 5000 },
          severity: "blocking",
        },
        {
          type: "profanity_check",
          config: {},
          severity: "blocking",
        },
      ],
      fail_threshold: 1,
    },
    subjective: {
      evaluation_model: "claude-sonnet-4-20250514",
      criteria: [
        {
          name: "Clarity",
          description: "Is the post clearly written and well-structured?",
          weight: 0.3,
          scale: 10,
        },
        {
          name: "Tone & Voice",
          description: "Does the tone match the brand voice guide?",
          weight: 0.25,
          scale: 10,
        },
        {
          name: "Completeness",
          description: "Does the post cover all topics mentioned in the brief?",
          weight: 0.25,
          scale: 10,
        },
        {
          name: "Engagement",
          description: "Is the post compelling with a clear CTA?",
          weight: 0.2,
          scale: 10,
        },
      ],
      pass_threshold: 7.0,
      require_rationale: true,
    },
    human: {
      assignment_strategy: "round_robin",
      required_reviewers: 1,
      consensus_rule: "any_approve",
      sla_hours: 12,
      show_ai_reviews: true,
    },
    revision_handling: {
      mode: "auto_revise",
      max_auto_revisions: 1,
      escalate_after_auto_fail: true,
    },
    default_notifications: [
      {
        driver: "slack",
        target: { channel: "#blog-reviews" },
        events: ["deliverable:submitted", "deliverable:decided"],
      },
    ],
    raw_json: "{}",
  },

  "code-review": {
    name: "code-review",
    stages: ["objective", "subjective"],
    max_revisions: 5,
    objective: {
      checks: [
        {
          type: "lint",
          module: "eslint",
          version: "9.x",
          config: { preset: "recommended" },
          severity: "blocking",
        },
        {
          type: "security_scan",
          config: { scanner: "semgrep", ruleset: "p/default" },
          severity: "blocking",
        },
      ],
      fail_threshold: 1,
    },
    subjective: {
      evaluation_model: "claude-sonnet-4-20250514",
      criteria: [
        {
          name: "Code Quality",
          description: "Is the code clean, idiomatic, and maintainable?",
          weight: 0.4,
          scale: 10,
        },
        {
          name: "Correctness",
          description: "Does the code correctly implement the requirements?",
          weight: 0.35,
          scale: 10,
        },
        {
          name: "Test Coverage",
          description: "Are edge cases and error paths adequately tested?",
          weight: 0.25,
          scale: 10,
        },
      ],
      pass_threshold: 7.5,
      require_rationale: true,
    },
    human: {
      assignment_strategy: "expertise_match",
      required_reviewers: 1,
      consensus_rule: "any_approve",
      sla_hours: 48,
      show_ai_reviews: false,
    },
    revision_handling: {
      mode: "manual",
    },
    default_notifications: [
      {
        driver: "github",
        target: { repo: "acmeco/platform" },
        events: ["deliverable:decided"],
      },
    ],
    raw_json: "{}",
  },

  "ad-creative-review": {
    name: "ad-creative-review",
    stages: ["objective", "subjective", "human"],
    max_revisions: 3,
    objective: {
      checks: [
        {
          type: "image_dimensions",
          config: { width: 1080, height: 1080 },
          severity: "blocking",
        },
        {
          type: "file_size",
          config: { max_mb: 2 },
          severity: "warning",
        },
        {
          type: "format_check",
          config: { allowed: ["image/png", "image/jpeg"] },
          severity: "blocking",
        },
        {
          type: "brand_colors",
          config: { palette: "spring-2026" },
          severity: "warning",
        },
      ],
      fail_threshold: 1,
    },
    subjective: {
      evaluation_model: "claude-sonnet-4-20250514",
      criteria: [
        {
          name: "Visual Appeal",
          description: "Is the creative visually compelling and on-brand?",
          weight: 0.35,
          scale: 10,
        },
        {
          name: "Message Clarity",
          description: "Is the tagline legible and the message immediately clear?",
          weight: 0.3,
          scale: 10,
        },
        {
          name: "Brand Consistency",
          description: "Does the creative align with brand guidelines?",
          weight: 0.35,
          scale: 10,
        },
      ],
      pass_threshold: 7.0,
      require_rationale: true,
    },
    human: {
      assignment_strategy: "round_robin",
      required_reviewers: 2,
      consensus_rule: "majority",
      sla_hours: 24,
      show_ai_reviews: true,
    },
    revision_handling: {
      mode: "hybrid",
      max_auto_revisions: 1,
      escalate_after_auto_fail: true,
    },
    default_notifications: [
      {
        driver: "slack",
        target: { channel: "#creative-review" },
        events: [
          "deliverable:submitted",
          "deliverable:stage_changed",
          "deliverable:decided",
        ],
      },
    ],
    raw_json: "{}",
  },
};

// ---------------------------------------------------------------------------
// Mutable state (so submitDecision can remove items)
// ---------------------------------------------------------------------------

let mutableSummaries = [...summaries];

// ---------------------------------------------------------------------------
// Mock API implementation
// ---------------------------------------------------------------------------

export const mockApi = {
  listDeliverables(stage?: string): Promise<DeliverableSummary[]> {
    const filtered = stage
      ? mutableSummaries.filter((d) => d.stage === stage)
      : mutableSummaries;
    return delay([...filtered]);
  },

  getDeliverable(id: string): Promise<Deliverable> {
    const full = fullDeliverables[id];
    if (full) return delay({ ...full });

    // For deliverables without full data, synthesize a minimal Deliverable
    const summary = mutableSummaries.find((d) => d.id === id);
    if (!summary) {
      return delay(null as unknown as Deliverable).then(() => {
        throw new Error(`Deliverable ${id} not found`);
      });
    }

    const synthesized: Deliverable = {
      ...summary,
      content: `# ${summary.title}\n\nContent for this deliverable is not yet available in the mock data set.`,
      brief: "No brief available for this mock deliverable.",
      objective_results: null,
      subjective_results: null,
      feedback: null,
      history: [],
      files: null,
      folder_strategy: null,
    };
    return delay(synthesized);
  },

  submitDecision(id: string, _payload: DecisionPayload): Promise<void> {
    mutableSummaries = mutableSummaries.filter((d) => d.id !== id);
    return delay(undefined);
  },

  getPipelineCounts(): Promise<PipelineCounts> {
    return delay({
      in_progress: 2, // objective + subjective
      pending_human: 2, // two items in human stage
      awaiting_revisions: 1,
      approved_72h: 1,
      rejected_72h: 0,
    });
  },

  listPolicies(): Promise<PolicySummary[]> {
    const list: PolicySummary[] = Object.values(policies).map((p) => ({
      name: p.name,
      stages: p.stages,
      max_revisions: p.max_revisions,
    }));
    return delay(list);
  },

  getPolicy(name: string): Promise<Policy> {
    const policy = policies[name];
    if (!policy) {
      return delay(null as unknown as Policy).then(() => {
        throw new Error(`Policy "${name}" not found`);
      });
    }
    return delay({ ...policy });
  },

  savePolicy(name: string, policy: Policy): Promise<void> {
    policies[name] = { ...policy, name };
    return delay(undefined);
  },

  deletePolicy(name: string): Promise<void> {
    delete policies[name];
    return delay(undefined);
  },
};
