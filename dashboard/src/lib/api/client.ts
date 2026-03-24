import type {
  Deliverable,
  DeliverableSummary,
  DecisionPayload,
  PipelineCounts,
  Policy,
  PolicySummary,
  CustomCriterion,
  RegistryCatalog,
  RegistryPolicy,
  InstallResult,
} from "./types";

const API_URL = import.meta.env.VITE_AROS_API_URL || "/api";

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
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const api = {
  async listDeliverables(
    stage?: string
  ): Promise<DeliverableSummary[]> {
    const params = stage ? `?stage=${stage}` : "";
    return fetchJson(`/deliverables${params}`);
  },

  async getDeliverable(id: string): Promise<Deliverable> {
    return fetchJson(`/deliverables/${id}`);
  },

  async submitDecision(
    id: string,
    payload: DecisionPayload
  ): Promise<void> {
    await fetchJson(`/deliverables/${id}/decision`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getPipelineCounts(): Promise<PipelineCounts> {
    return fetchJson("/pipeline/counts");
  },

  async listPolicies(): Promise<PolicySummary[]> {
    return fetchJson("/policies");
  },

  async getPolicy(name: string): Promise<Policy> {
    return fetchJson(`/policies/${name}`);
  },

  async savePolicy(
    name: string,
    policy: Policy
  ): Promise<void> {
    await fetchJson(`/policies/${name}`, {
      method: "PUT",
      body: JSON.stringify(policy),
    });
  },

  async deletePolicy(name: string): Promise<void> {
    await fetchJson(`/policies/${name}`, { method: "DELETE" });
  },

  // --- Registry ---

  async getRegistryCatalog(): Promise<RegistryCatalog> {
    return fetchJson("/registry");
  },

  async getRegistryPolicy(name: string): Promise<RegistryPolicy> {
    return fetchJson(`/registry/policies/${name}`);
  },

  async installPolicy(policyName: string): Promise<InstallResult> {
    return fetchJson("/registry/install", {
      method: "POST",
      body: JSON.stringify({ policy: policyName }),
    });
  },

  // --- Custom Criteria ---

  async listCustomCriteria(): Promise<CustomCriterion[]> {
    return fetchJson("/criteria");
  },

  async createCriterion(criterion: CustomCriterion): Promise<CustomCriterion> {
    return fetchJson("/criteria", {
      method: "POST",
      body: JSON.stringify(criterion),
    });
  },

  async updateCriterion(name: string, criterion: CustomCriterion): Promise<CustomCriterion> {
    return fetchJson(`/criteria/${encodeURIComponent(name)}`, {
      method: "PUT",
      body: JSON.stringify(criterion),
    });
  },

  async deleteCriterion(name: string): Promise<void> {
    await fetchJson(`/criteria/${encodeURIComponent(name)}`, { method: "DELETE" });
  },

};
