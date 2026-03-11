import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  type ReactNode,
  type Dispatch,
} from "react";
import { appReducer, initialState, type AppState, type AppAction } from "./app-reducer";
import { api } from "@/lib/api/client";

interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  selectDeliverable: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const selectDeliverable = useCallback(
    (id: string) => {
      dispatch({ type: "SELECT_DELIVERABLE", id });
      api.getDeliverable(id).then((deliverable) => {
        dispatch({ type: "SET_SELECTED_DETAIL", deliverable });
      });
    },
    []
  );

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
    dispatch({ type: "SET_CONNECTION_STATUS", status: "connected" });
  }, [selectDeliverable]);

  return (
    <AppContext.Provider value={{ state, dispatch, selectDeliverable }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
