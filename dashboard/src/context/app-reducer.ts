import type {
  DeliverableSummary,
  Deliverable,
  Decision,
  PipelineCounts,
  ConnectionStatus,
} from "@/lib/api/types";
import type { FileAnnotations } from "@/pages/review-page";

export interface DecidedInfo {
  decision: Decision;
  selectedFile: string | null;
  reason: string;
  annotations: FileAnnotations;
}

export interface AppState {
  queue: DeliverableSummary[];
  selectedId: string | null;
  selectedDeliverable: Deliverable | null;
  decidedMap: Record<string, DecidedInfo>;
  pipelineCounts: PipelineCounts;
  connectionStatus: ConnectionStatus;
  loading: boolean;
}

export const initialState: AppState = {
  queue: [],
  selectedId: null,
  selectedDeliverable: null,
  decidedMap: {},
  pipelineCounts: {
    in_progress: 0,
    pending_human: 0,
    awaiting_revisions: 0,
    approved_72h: 0,
    rejected_72h: 0,
  },
  connectionStatus: "disconnected",
  loading: true,
};

export type AppAction =
  | { type: "SET_QUEUE"; queue: DeliverableSummary[] }
  | { type: "SELECT_DELIVERABLE"; id: string | null }
  | { type: "SET_SELECTED_DETAIL"; deliverable: Deliverable }
  | { type: "REMOVE_FROM_QUEUE"; id: string }
  | { type: "ADD_TO_QUEUE"; item: DeliverableSummary }
  | { type: "MARK_DECIDED"; id: string; info: DecidedInfo }
  | { type: "SET_PIPELINE_COUNTS"; counts: PipelineCounts }
  | { type: "SET_CONNECTION_STATUS"; status: ConnectionStatus }
  | { type: "SET_LOADING"; loading: boolean };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_QUEUE":
      return { ...state, queue: action.queue, loading: false };

    case "SELECT_DELIVERABLE":
      return { ...state, selectedId: action.id, selectedDeliverable: null };

    case "SET_SELECTED_DETAIL":
      return { ...state, selectedDeliverable: action.deliverable };

    case "REMOVE_FROM_QUEUE": {
      const queue = state.queue.filter((d) => d.id !== action.id);
      const selectedId =
        state.selectedId === action.id
          ? queue[0]?.id ?? null
          : state.selectedId;
      return {
        ...state,
        queue,
        selectedId,
        selectedDeliverable:
          state.selectedId === action.id ? null : state.selectedDeliverable,
      };
    }

    case "ADD_TO_QUEUE": {
      if (state.queue.some((d) => d.id === action.item.id)) return state;
      const newQueue = [...state.queue, action.item];
      // Auto-select new arrival if current item is decided
      const autoSelect = state.selectedId && state.decidedMap[state.selectedId];
      return {
        ...state,
        queue: newQueue,
        ...(autoSelect ? { selectedId: action.item.id, selectedDeliverable: null } : {}),
      };
    }

    case "MARK_DECIDED":
      return {
        ...state,
        decidedMap: { ...state.decidedMap, [action.id]: action.info },
      };

    case "SET_PIPELINE_COUNTS":
      return { ...state, pipelineCounts: action.counts };

    case "SET_CONNECTION_STATUS":
      return { ...state, connectionStatus: action.status };

    case "SET_LOADING":
      return { ...state, loading: action.loading };

    default:
      return state;
  }
}
