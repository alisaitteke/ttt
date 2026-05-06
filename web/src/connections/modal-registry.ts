import type { Component } from 'vue';
import WhatsAppConnectionModal from '@/components/connections/WhatsAppConnectionModal.vue';

export type ConnectionProviderId = 'whatsapp';

export function resolveConnectionSetupModal(id: ConnectionProviderId): Component {
  if (id === 'whatsapp') return WhatsAppConnectionModal;
  throw new Error(`Unknown connection provider: ${id}`);
}
