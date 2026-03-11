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
