import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
  type Dispatch,
} from "react";
import { appReducer, initialState, type AppState, type AppAction } from "./app-reducer";
import { api } from "@/lib/api/client";
import { SSEManager } from "@/lib/api/sse";
import type { SSEEventType, DeliverableSummary } from "@/lib/api/types";

interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  selectDeliverable: (id: string) => void;
  retry: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function maybeNotify(title: string, body: string) {
  if (typeof Notification === "undefined") return;
  if (document.hasFocus()) return;

  if (Notification.permission === "default") {
    Notification.requestPermission().then((perm) => {
      if (perm === "granted") {
        new Notification(title, { body });
      }
    });
  } else if (Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const managerRef = useRef<SSEManager | null>(null);
  const selectedIdRef = useRef(state.selectedId);

  // Keep selectedId ref in sync to avoid stale closures in SSE callback
  useEffect(() => {
    selectedIdRef.current = state.selectedId;
  }, [state.selectedId]);

  const selectDeliverable = useCallback(
    (id: string) => {
      dispatch({ type: "SELECT_DELIVERABLE", id });
      api.getDeliverable(id).then((deliverable) => {
        dispatch({ type: "SET_SELECTED_DETAIL", deliverable });
      });
    },
    []
  );

  const retry = useCallback(() => {
    managerRef.current?.retry();
  }, []);

  // SSE connection
  useEffect(() => {
    const refreshCounts = () => {
      api.getPipelineCounts().then((counts) => {
        dispatch({ type: "SET_PIPELINE_COUNTS", counts });
      }).catch(() => {});
    };

    const handleEvent = (event: SSEEventType, data: Record<string, unknown>) => {
      switch (event) {
        case "deliverable:submitted": {
          refreshCounts();
          if (data.stage === "human") {
            dispatch({ type: "ADD_TO_QUEUE", item: data as unknown as DeliverableSummary });
          }
          break;
        }

        case "deliverable:stage_changed": {
          if (data.new_stage === "human") {
            dispatch({ type: "ADD_TO_QUEUE", item: data as unknown as DeliverableSummary });
            maybeNotify(
              "New item awaiting review",
              (data.title as string) || "A deliverable needs your attention."
            );
          }
          if (data.old_stage === "human") {
            dispatch({ type: "REMOVE_FROM_QUEUE", id: data.id as string });
          }
          refreshCounts();
          break;
        }

        case "deliverable:decided": {
          dispatch({ type: "REMOVE_FROM_QUEUE", id: data.id as string });
          refreshCounts();
          break;
        }

        case "deliverable:revised": {
          refreshCounts();
          if (data.id === selectedIdRef.current) {
            api.getDeliverable(data.id as string).then((deliverable) => {
              dispatch({ type: "SET_SELECTED_DETAIL", deliverable });
            });
          }
          break;
        }
      }
    };

    const handleStatus = (status: "connected" | "reconnecting" | "disconnected") => {
      dispatch({ type: "SET_CONNECTION_STATUS", status });
    };

    const manager = new SSEManager(handleEvent, handleStatus);
    managerRef.current = manager;
    manager.connect();

    return () => {
      manager.dispose();
      managerRef.current = null;
    };
  }, []);

  // Load initial queue
  useEffect(() => {
    api
      .listDeliverables("human")
      .then((queue) => {
        dispatch({ type: "SET_QUEUE", queue });
        if (queue.length > 0) {
          selectDeliverable(queue[0].id);
        }
      })
      .catch(() => dispatch({ type: "SET_LOADING", loading: false }));
    api
      .getPipelineCounts()
      .then((counts) => {
        dispatch({ type: "SET_PIPELINE_COUNTS", counts });
      })
      .catch(() => {});
  }, [selectDeliverable]);

  return (
    <AppContext.Provider value={{ state, dispatch, selectDeliverable, retry }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
