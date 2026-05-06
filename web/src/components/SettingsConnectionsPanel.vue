<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-vue-next';
import AdobeAppIcon from '@/components/AdobeAppIcon.vue';
import WhatsAppConnectionModal from '@/components/connections/WhatsAppConnectionModal.vue';
import { apiListConnections, type ConnectionPublicInfo } from '@/lib/api';
import type { ConnectionProviderId } from '@/connections/modal-registry';

const props = defineProps<{
  autoOpenProvider?: ConnectionProviderId | null;
}>();

const emit = defineEmits<{
  changed: [];
}>();

const { t } = useI18n();

const assetBase = import.meta.env.BASE_URL;

/** Logos: Simple Icons (MIT) — https://github.com/simple-icons/simple-icons */
const comingSoonMessaging = [
  { id: 'telegram', file: 'telegram-mark.svg', labelKey: 'settings.connections.brands.telegram' },
  { id: 'signal', file: 'signal-mark.svg', labelKey: 'settings.connections.brands.signal' },
  { id: 'discord', file: 'discord-mark.svg', labelKey: 'settings.connections.brands.discord' },
  { id: 'slack', file: 'slack-mark.svg', labelKey: 'settings.connections.brands.slack' },
  { id: 'messenger', file: 'messenger-mark.svg', labelKey: 'settings.connections.brands.messenger' },
  {
    id: 'microsoftTeams',
    file: 'microsoft-teams-mark.svg',
    labelKey: 'settings.connections.brands.microsoftTeams',
  },
] as const;

const list = ref<ConnectionPublicInfo[]>([]);
const busy = ref(false);
const whatsappModalOpen = ref(false);

async function refresh(): Promise<void> {
  busy.value = true;
  try {
    const res = await apiListConnections();
    list.value = res.connections;
  } finally {
    busy.value = false;
  }
}

function openWhatsAppSetup(): void {
  whatsappModalOpen.value = true;
}

watch(whatsappModalOpen, (v) => {
  if (!v) {
    void refresh();
    emit('changed');
  }
});

onMounted(refresh);

watch(
  () => props.autoOpenProvider,
  (id) => {
    if (id === 'whatsapp') openWhatsAppSetup();
  },
  { immediate: true }
);

defineExpose({ refresh });
</script>

<template>
  <div class="space-y-3">
    <ul class="space-y-2">
      <li
        v-for="c in list"
        :key="c.id"
        class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
      >
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <AdobeAppIcon v-if="c.id === 'whatsapp'" app="whatsapp" :size="20" class="shrink-0" />
          <span class="truncate text-sm font-semibold">{{ c.displayName }}</span>
          <span
            v-if="c.id === 'whatsapp'"
            class="inline-flex shrink-0 rounded border border-border bg-muted/50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {{ t('connections.whatsapp.betaBadge') }}
          </span>
          <span
            v-if="c.connected"
            class="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground"
          >
            <Check class="size-3 text-emerald-600 dark:text-emerald-400" />
            {{ t('settings.connections.statusConnected') }}
          </span>
          <span v-else class="text-[10px] text-muted-foreground">
            {{ t('settings.connections.statusDisconnected') }}
          </span>
        </div>
        <Button
          v-if="c.id === 'whatsapp'"
          size="sm"
          variant="outline"
          class="shrink-0"
          :disabled="busy"
          @click="openWhatsAppSetup"
        >
          {{ c.connected ? t('settings.connections.manage') : t('settings.connections.setUp') }}
        </Button>
      </li>

      <li
        v-for="item in comingSoonMessaging"
        :key="item.id"
        class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-muted/10 px-3 py-2.5"
      >
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <img
            :src="`${assetBase}${item.file}`"
            :alt="t(item.labelKey)"
            class="size-5 shrink-0 object-contain"
            width="20"
            height="20"
            draggable="false"
          />
          <span class="truncate text-sm font-semibold">{{ t(item.labelKey) }}</span>
          <span
            class="inline-flex shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            {{ t('settings.connections.comingSoon') }}
          </span>
        </div>
      </li>
    </ul>

    <WhatsAppConnectionModal v-model:open="whatsappModalOpen" @linked="emit('changed')" />
  </div>
</template>
