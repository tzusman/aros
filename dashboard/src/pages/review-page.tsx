import { useState, useMemo, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
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
  const { id: routeId } = useParams<{ id: string }>();
  const { state, selectDeliverable } = useApp();

  // Auto-select deliverable from URL param
  useEffect(() => {
    if (routeId && routeId !== state.selectedId) {
      selectDeliverable(routeId);
    }
  }, [routeId]);
  const queue = usePanelState("queue", true);
  const context = usePanelState("context", true);
  const [contextTab, setContextTab] = useState("brief");
  const [inspectedFile, setInspectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const fileCacheRef = useRef<Map<string, string>>(new Map());

  const deliverable = state.selectedDeliverable;

  const isImageFolder =
    deliverable?.is_folder &&
    deliverable?.files?.some((f) => f.content_type.startsWith("image/"));

  async function fetchFileContent(filename: string) {
    setInspectedFile(filename);
    if (!deliverable?.files) return;

    const cacheKey = `${deliverable.id}:${filename}`;
    const cached = fileCacheRef.current.get(cacheKey);
    if (cached) {
      setFileContent(cached);
      return;
    }

    const file = deliverable.files.find((f) => f.filename === filename);
    if (!file?.preview_url) return;
    setFileLoading(true);
    try {
      const res = await fetch(file.preview_url);
      if (res.ok) {
        const text = await res.text();
        fileCacheRef.current.set(cacheKey, text);
        setFileContent(text);
      }
    } catch {
      setFileContent(null);
    } finally {
      setFileLoading(false);
    }
  }

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

  // Reset file state and auto-select first file when deliverable changes
  const prevDeliverableId = useRef(deliverable?.id);
  useEffect(() => {
    if (deliverable?.id === prevDeliverableId.current) return;
    prevDeliverableId.current = deliverable?.id;
    setInspectedFile(null);
    setFileContent(null);
    fileCacheRef.current.clear();

    if (
      deliverable?.is_folder &&
      deliverable.files?.length &&
      !deliverable.files.some((f) => f.content_type.startsWith("image/"))
    ) {
      fetchFileContent(deliverable.files[0].filename);
    }
  }, [deliverable?.id]);

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
                      onSelect={fetchFileContent}
                    />
                    {fileLoading ? (
                      <div className="flex-1 flex items-center justify-center">
                        <p className="text-sm text-text-muted">Loading...</p>
                      </div>
                    ) : (
                      <ContentArea
                        deliverable={deliverable}
                        fileContent={fileContent}
                      />
                    )}
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
