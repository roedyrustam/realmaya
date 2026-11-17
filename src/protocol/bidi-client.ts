/** Error thrown when a WebDriver BiDi or CDP command fails or times out. */
export class ProtocolError extends Error {
  readonly code: string | number;
  readonly method: string;

  constructor(method: string, code: string | number, message: string) {
    super(`[${method}] (${code}): ${message}`);
    this.name = 'ProtocolError';
    this.code = code;
    this.method = method;
  }
}

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

type EventListener = (params: Record<string, unknown>) => void;

/**
 * Lightweight WebSocket JSON-RPC multiplexer supporting both WebDriver BiDi
 * (Firefox native / BiDi endpoints) and Chrome DevTools Protocol (CDP).
 */
export class RpcTransport {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly listeners = new Map<string, Set<EventListener>>();
  private readonly timeoutMs: number;
  private closed = false;

  constructor(timeoutMs = 30_000) {
    this.timeoutMs = timeoutMs;
  }

  /** Connects to a WebSocket endpoint (`ws://...`). */
  async connect(wsUrl: string): Promise<void> {
    if (this.ws) {
      throw new Error('RpcTransport is already connected');
    }

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const connectTimer = setTimeout(() => {
        ws.close();
        reject(new ProtocolError('connect', 'TIMEOUT', `Timed out connecting to ${wsUrl}`));
      }, this.timeoutMs);

      ws.addEventListener('open', () => {
        clearTimeout(connectTimer);
        this.ws = ws;
        resolve();
      });

      ws.addEventListener('error', () => {
        clearTimeout(connectTimer);
        reject(new ProtocolError('connect', 'WS_ERROR', `WebSocket connection failed: ${wsUrl}`));
      });

      ws.addEventListener('message', (event) => {
        this.handleMessage(String(event.data));
      });

      ws.addEventListener('close', () => {
        this.rejectAllPending('WebSocket connection closed');
      });
    });
  }

  /** Sends a JSON-RPC command and awaits its typed result. */
  async send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<T> {
    if (this.closed || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new ProtocolError(method, 'DISCONNECTED', 'Transport is not connected');
    }

    const id = this.nextId++;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId !== undefined) {
      payload.sessionId = sessionId;
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ProtocolError(method, 'TIMEOUT', `Command timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      this.pending.set(id, {
        method,
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      this.ws?.send(JSON.stringify(payload));
    });
  }

  /** Subscribes to a protocol event. Returns an unsubscribe function. */
  on(event: string, listener: EventListener): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  }

  /** Closes the WebSocket connection and rejects all in-flight requests. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.rejectAllPending('Transport closed');
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.ws = null;
    this.listeners.clear();
  }

  private handleMessage(raw: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    const id = typeof msg.id === 'number' ? msg.id : undefined;
    if (id !== undefined) {
      const req = this.pending.get(id);
      if (!req) return;
      this.pending.delete(id);
      clearTimeout(req.timer);

      // WebDriver BiDi error format: { id, type: "error", error: "...", message: "..." }
      if (msg.type === 'error') {
        req.reject(
          new ProtocolError(
            req.method,
            String(msg.error ?? 'BIDI_ERROR'),
            String(msg.message ?? 'Unknown BiDi error'),
          ),
        );
        return;
      }

      // CDP error format: { id, error: { code, message } }
      if (msg.error && typeof msg.error === 'object') {
        const errObj = msg.error as Record<string, unknown>;
        req.reject(
          new ProtocolError(
            req.method,
            typeof errObj.code === 'number' || typeof errObj.code === 'string'
              ? errObj.code
              : 'CDP_ERROR',
            String(errObj.message ?? 'Unknown CDP error'),
          ),
        );
        return;
      }

      req.resolve(msg.result ?? {});
      return;
    }

    // Protocol event: { method, params }
    if (typeof msg.method === 'string') {
      const handlers = this.listeners.get(msg.method);
      if (!handlers) return;
      const params = (msg.params && typeof msg.params === 'object' ? msg.params : {}) as Record<
        string,
        unknown
      >;
      for (const handler of handlers) {
        handler(params);
      }
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [id, req] of this.pending) {
      clearTimeout(req.timer);
      req.reject(new ProtocolError(req.method, 'CLOSED', reason));
      this.pending.delete(id);
    }
  }
}
