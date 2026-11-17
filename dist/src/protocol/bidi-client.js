/** Error thrown when a WebDriver BiDi or CDP command fails or times out. */
export class ProtocolError extends Error {
    code;
    method;
    constructor(method, code, message) {
        super(`[${method}] (${code}): ${message}`);
        this.name = 'ProtocolError';
        this.code = code;
        this.method = method;
    }
}
/**
 * Lightweight WebSocket JSON-RPC multiplexer supporting both WebDriver BiDi
 * (Firefox native / BiDi endpoints) and Chrome DevTools Protocol (CDP).
 */
export class RpcTransport {
    ws = null;
    nextId = 1;
    pending = new Map();
    listeners = new Map();
    timeoutMs;
    closed = false;
    constructor(timeoutMs = 30_000) {
        this.timeoutMs = timeoutMs;
    }
    /** Connects to a WebSocket endpoint (`ws://...`). */
    async connect(wsUrl) {
        if (this.ws) {
            throw new Error('RpcTransport is already connected');
        }
        await new Promise((resolve, reject) => {
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
    async send(method, params = {}, sessionId) {
        if (this.closed || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new ProtocolError(method, 'DISCONNECTED', 'Transport is not connected');
        }
        const id = this.nextId++;
        const payload = { id, method, params };
        if (sessionId !== undefined) {
            payload.sessionId = sessionId;
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new ProtocolError(method, 'TIMEOUT', `Command timed out after ${this.timeoutMs}ms`));
            }, this.timeoutMs);
            this.pending.set(id, {
                method,
                resolve: resolve,
                reject,
                timer,
            });
            this.ws?.send(JSON.stringify(payload));
        });
    }
    /** Subscribes to a protocol event. Returns an unsubscribe function. */
    on(event, listener) {
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
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        this.rejectAllPending('Transport closed');
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
        this.ws = null;
        this.listeners.clear();
    }
    handleMessage(raw) {
        let msg;
        try {
            msg = JSON.parse(raw);
        }
        catch {
            return;
        }
        const id = typeof msg.id === 'number' ? msg.id : undefined;
        if (id !== undefined) {
            const req = this.pending.get(id);
            if (!req)
                return;
            this.pending.delete(id);
            clearTimeout(req.timer);
            // WebDriver BiDi error format: { id, type: "error", error: "...", message: "..." }
            if (msg.type === 'error') {
                req.reject(new ProtocolError(req.method, String(msg.error ?? 'BIDI_ERROR'), String(msg.message ?? 'Unknown BiDi error')));
                return;
            }
            // CDP error format: { id, error: { code, message } }
            if (msg.error && typeof msg.error === 'object') {
                const errObj = msg.error;
                req.reject(new ProtocolError(req.method, typeof errObj.code === 'number' || typeof errObj.code === 'string'
                    ? errObj.code
                    : 'CDP_ERROR', String(errObj.message ?? 'Unknown CDP error')));
                return;
            }
            req.resolve(msg.result ?? {});
            return;
        }
        // Protocol event: { method, params }
        if (typeof msg.method === 'string') {
            const handlers = this.listeners.get(msg.method);
            if (!handlers)
                return;
            const params = (msg.params && typeof msg.params === 'object' ? msg.params : {});
            for (const handler of handlers) {
                handler(params);
            }
        }
    }
    rejectAllPending(reason) {
        for (const [id, req] of this.pending) {
            clearTimeout(req.timer);
            req.reject(new ProtocolError(req.method, 'CLOSED', reason));
            this.pending.delete(id);
        }
    }
}
//# sourceMappingURL=bidi-client.js.map