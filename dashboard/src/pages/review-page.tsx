import { useState, useMemo, useEffect } from "react";
import { useApp } from "@/context/app-context";
import { useKeyboard } from "@/lib/hooks/use-keyboard";
import { usePanelState } from "@/lib/hooks/use-panel-state";
import { QueueSidebar } from "@/components/review/queue-sidebar";
import { ContentHeader } from "@/components/review/content-header";
import { ContentArea } from "@/components/review/content-area";
import { ContextPanel } from "@/components/review/context-panel";
import { DecisionBar } from "@/components/review/decision-bar";
import { ImageGrid } from "@/components/folder/image-grid";
import { FileTabs } from "@/components/folder/file-tabs";

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
  const [inspectedFile, setInspectedFile] = useState<string | null>(null);

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

  const isImageFolder =
    deliverable?.is_folder &&
    deliverable?.files?.some((f) => f.content_type.startsWith("image/"));

  useEffect(() => {
    setInspectedFile(null);
  }, [state.selectedId]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 min-h-0">
        <QueueSidebar isOpen={queue.isOpen} onClose={queue.toggle} />

        <div className="flex-1 flex flex-col min-w-0">
          {deliverable ? (
            <>
              <ContentHeader deliverable={deliverable} />
              {deliverable.is_folder && deliverable.files ? (
                isImageFolder ? (
                  <ImageGrid
                    files={deliverable.files}
                    onInspect={setInspectedFile}
                    inspectedFile={inspectedFile}
                  />
                ) : (
                  <>
                    <FileTabs
                      files={deliverable.files}
                      activeFile={inspectedFile}
                      onSelect={setInspectedFile}
                    />
                    <ContentArea deliverable={deliverable} />
                  </>
                )
              ) : (
                <ContentArea deliverable={deliverable} />
              )}
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
