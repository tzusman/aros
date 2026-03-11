import type {
  DeliverableSummary,
  Deliverable,
  PipelineCounts,
  ConnectionStatus,
} from "@/lib/api/types";

export interface AppState {
  queue: DeliverableSummary[];
  selectedId: string | null;
  selectedDeliverable: Deliverable | null;
  pipelineCounts: PipelineCounts;
  connectionStatus: ConnectionStatus;
  loading: boolean;
}

export const initialState: AppState = {
  queue: [],
  selectedId: null,
  selectedDeliverable: null,
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

    case "ADD_TO_QUEUE":
      if (state.queue.some((d) => d.id === action.item.id)) return state;
      return { ...state, queue: [...state.queue, action.item] };

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
