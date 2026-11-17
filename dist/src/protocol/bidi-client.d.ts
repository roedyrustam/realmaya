/** Error thrown when a WebDriver BiDi or CDP command fails or times out. */
export declare class ProtocolError extends Error {
    readonly code: string | number;
    readonly method: string;
    constructor(method: string, code: string | number, message: string);
}
type EventListener = (params: Record<string, unknown>) => void;
/**
 * Lightweight WebSocket JSON-RPC multiplexer supporting both WebDriver BiDi
 * (Firefox native / BiDi endpoints) and Chrome DevTools Protocol (CDP).
 */
export declare class RpcTransport {
    private ws;
    private nextId;
    private readonly pending;
    private readonly listeners;
    private readonly timeoutMs;
    private closed;
    constructor(timeoutMs?: number);
    /** Connects to a WebSocket endpoint (`ws://...`). */
    connect(wsUrl: string): Promise<void>;
    /** Sends a JSON-RPC command and awaits its typed result. */
    send<T = Record<string, unknown>>(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<T>;
    /** Subscribes to a protocol event. Returns an unsubscribe function. */
    on(event: string, listener: EventListener): () => void;
    /** Closes the WebSocket connection and rejects all in-flight requests. */
    close(): Promise<void>;
    private handleMessage;
    private rejectAllPending;
}
export {};
//# sourceMappingURL=bidi-client.d.ts.map