import type { ConnectionAdapter, ConnectionAdapterId } from './types.js';
import { WhatsAppConnectionAdapter } from './adapters/whatsapp/whatsapp-adapter.js';

const whatsapp = new WhatsAppConnectionAdapter();

const byId: Record<ConnectionAdapterId, ConnectionAdapter> = {
  whatsapp,
};

export function getConnectionAdapter(id: ConnectionAdapterId): ConnectionAdapter {
  const a = byId[id];
  if (!a) throw new Error(`unknown_connection_adapter:${id}`);
  return a;
}

export function listConnectionAdapterIds(): ConnectionAdapterId[] {
  return Object.keys(byId) as ConnectionAdapterId[];
}

export function listConnectionAdapters(): ConnectionAdapter[] {
  return listConnectionAdapterIds().map((id) => byId[id]);
}
