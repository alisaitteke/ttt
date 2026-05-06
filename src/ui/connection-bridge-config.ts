export interface ConnectionBridgeConfig {
  baseUrl: string;
  secret: string;
}

let bridge: ConnectionBridgeConfig | null = null;

export function setConnectionBridgeConfig(config: ConnectionBridgeConfig | null): void {
  bridge = config;
}

export function getConnectionBridgeConfig(): ConnectionBridgeConfig | null {
  return bridge;
}
