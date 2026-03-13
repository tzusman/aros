import { useState, useEffect, useCallback } from "react";
import { PolicyList } from "@/components/policies/policy-list";
import { PolicyEditor } from "@/components/policies/policy-editor";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import type { Policy } from "@/lib/api/types";

export function PoliciesPage() {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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

  const handleDeleted = useCallback(() => {
    setSelectedName(null);
    setPolicy(null);
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="flex h-full">
      <PolicyList
        selectedPolicy={selectedName}
        onSelect={setSelectedName}
        refreshKey={refreshKey}
      />
      <div className="flex-1 min-w-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-text-muted">Loading...</p>
          </div>
        ) : policy ? (
          <PolicyEditor key={policy.name} policy={policy} onDeleted={handleDeleted} />
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
