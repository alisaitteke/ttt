export type ConnectionAdapterId = 'whatsapp';

export type WhatsAppStreamEvent =
  | { type: 'qr'; raw: string }
  | { type: 'connected' }
  | { type: 'disconnected'; reason?: string; statusCode?: number }
  | { type: 'stream_error'; message: string };

export interface ConnectionPublicInfo {
  id: ConnectionAdapterId;
  displayName: string;
  connected: boolean;
  /** Opaque session hint (e.g. WhatsApp user id) — avoid logging phone numbers. */
  sessionHint?: string;
}

export interface ConnectionAdapter {
  readonly id: ConnectionAdapterId;
  readonly displayName: string;

  getPublicInfo(): Promise<ConnectionPublicInfo>;

  getLatestQrRaw(): string | null;

  /** Start the Baileys socket (QR flow if needed). Idempotent if already open. */
  ensureSocket(): Promise<void>;

  subscribe(listener: (ev: WhatsAppStreamEvent) => void): () => void;

  disconnect(): Promise<void>;

  /** Delete stored credentials and disconnect. */
  logout(): Promise<void>;

  invokeTool(toolName: string, args: Record<string, unknown>): Promise<string>;
}
