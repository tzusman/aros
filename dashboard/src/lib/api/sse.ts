import type { SSEEventType, ConnectionStatus } from "./types";

type SSECallback = (event: SSEEventType, data: Record<string, unknown>) => void;
type StatusCallback = (status: ConnectionStatus) => void;

const API_URL = import.meta.env.VITE_AROS_API_URL || "";

export class SSEManager {
  private eventSource: EventSource | null = null;
  private onEvent: SSECallback;
  private onStatus: StatusCallback;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30_000;
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(onEvent: SSECallback, onStatus: StatusCallback) {
    this.onEvent = onEvent;
    this.onStatus = onStatus;
  }

  private hasConnected = false;

  connect() {
    if (this.disposed || !API_URL) {
      // Mock mode — simulate connected
      this.onStatus("connected");
      return;
    }

    this.onStatus(this.hasConnected ? "reconnecting" : "disconnected");
    const es = new EventSource(`${API_URL}/events`);
    this.eventSource = es;

    es.onopen = () => {
      this.hasConnected = true;
      this.reconnectDelay = 1000;
      this.onStatus("connected");
      this.resetHeartbeat();
    };

    es.onmessage = (e) => {
      this.resetHeartbeat();
      try {
        const parsed = JSON.parse(e.data);
        this.onEvent(parsed.type, parsed.data || parsed);
      } catch {
        // Heartbeat or unparseable — ignore
      }
    };

    es.onerror = () => {
      this.cleanup();
      this.onStatus("reconnecting");
      this.scheduleReconnect();
    };
  }

  private resetHeartbeat() {
    if (this.heartbeatTimeout) clearTimeout(this.heartbeatTimeout);
    this.heartbeatTimeout = setTimeout(() => {
      // No heartbeat for 60s — reconnect
      this.cleanup();
      this.onStatus("reconnecting");
      this.scheduleReconnect();
    }, 60_000);
  }

  private scheduleReconnect() {
    if (this.disposed) return;
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      this.maxReconnectDelay
    );
  }

  private cleanup() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  retry() {
    this.reconnectDelay = 1000;
    this.connect();
  }

  dispose() {
    this.disposed = true;
    this.cleanup();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
}
