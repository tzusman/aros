import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Feedback } from "@aros/types";
import { paperclipDriver } from "../notifications/paperclip.js";

// ---- validateTarget ----

describe("paperclipDriver.validateTarget()", () => {
  it("passes when all required fields are present", () => {
    const result = paperclipDriver.validateTarget({
      api_url: "https://paperclip.example.com",
      company_id: "comp-123",
      issue_id: "issue-456",
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("fails when api_url is missing", () => {
    const result = paperclipDriver.validateTarget({
      company_id: "comp-123",
      issue_id: "issue-456",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("fails when issue_id is missing", () => {
    const result = paperclipDriver.validateTarget({
      api_url: "https://paperclip.example.com",
      company_id: "comp-123",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("fails when company_id is missing", () => {
    const result = paperclipDriver.validateTarget({
      api_url: "https://paperclip.example.com",
      issue_id: "issue-456",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ---- send() helpers ----

const TARGET = {
  api_url: "https://paperclip.example.com",
  company_id: "comp-123",
  issue_id: "issue-456",
};

const DELIVERABLE = {
  review_id: "d-20260312-001",
  title: "Q1 Banner Ad",
  revision_number: 1,
};

const FEEDBACK: Feedback = {
  stage: "human",
  decision: "revision_requested",
  summary: "Needs clearer call-to-action",
  issues: [
    {
      file: "banner.png",
      location: "bottom-right",
      category: "copy",
      severity: "major",
      description: "CTA is too small",
      suggestion: "Increase font size to at least 18px",
    },
  ],
  reviewer: "human",
  timestamp: "2026-03-12T10:00:00Z",
};

// ---- send("approved") ----

describe('paperclipDriver.send("approved")', () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "comment-1" }),
    }));
  });

  it("makes exactly 2 fetch calls (comment + status update)", async () => {
    const result = await paperclipDriver.send("approved", DELIVERABLE, null, TARGET);
    expect(result.success).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it("posts comment to the correct URL", async () => {
    await paperclipDriver.send("approved", DELIVERABLE, null, TARGET);
    const calls = vi.mocked(fetch).mock.calls;
    const commentCall = calls[0];
    expect(commentCall[0]).toBe(
      "https://paperclip.example.com/api/companies/comp-123/issues/issue-456/comments"
    );
    expect(commentCall[1]?.method).toBe("POST");
  });

  it('patches issue status to "done"', async () => {
    await paperclipDriver.send("approved", DELIVERABLE, null, TARGET);
    const calls = vi.mocked(fetch).mock.calls;
    const patchCall = calls[1];
    expect((patchCall[0] as string)).toContain("issues/issue-456");
    expect(patchCall[1]?.method).toBe("PATCH");
    const body = JSON.parse(patchCall[1]?.body as string);
    expect(body.status).toBe("done");
  });
});

// ---- send("revision_requested") ----

describe('paperclipDriver.send("revision_requested")', () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "comment-2" }),
    }));
  });

  it("makes exactly 1 fetch call (comment only)", async () => {
    const result = await paperclipDriver.send(
      "revision_requested",
      DELIVERABLE,
      FEEDBACK,
      TARGET
    );
    expect(result.success).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("posts comment to the correct URL", async () => {
    await paperclipDriver.send("revision_requested", DELIVERABLE, FEEDBACK, TARGET);
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls[0][0]).toBe(
      "https://paperclip.example.com/api/companies/comp-123/issues/issue-456/comments"
    );
    expect(calls[0][1]?.method).toBe("POST");
  });
});

// ---- send("rejected") ----

describe('paperclipDriver.send("rejected")', () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "comment-3" }),
    }));
  });

  it("makes exactly 2 fetch calls (comment + status update)", async () => {
    const result = await paperclipDriver.send("rejected", DELIVERABLE, FEEDBACK, TARGET);
    expect(result.success).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it('patches issue status to "blocked"', async () => {
    await paperclipDriver.send("rejected", DELIVERABLE, FEEDBACK, TARGET);
    const calls = vi.mocked(fetch).mock.calls;
    const patchCall = calls[1];
    expect(patchCall[1]?.method).toBe("PATCH");
    const body = JSON.parse(patchCall[1]?.body as string);
    expect(body.status).toBe("blocked");
  });
});

// ---- fetch failure handling ----

describe("paperclipDriver.send() — fetch failure", () => {
  it("returns { success: false, error } when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    const result = await paperclipDriver.send("approved", DELIVERABLE, null, TARGET);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns { success: false, error } when fetch returns non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    }));
    const result = await paperclipDriver.send("approved", DELIVERABLE, null, TARGET);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
