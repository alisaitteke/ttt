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
    <h3 class="text-sm font-medium">{{ t('settings.connections.heading') }}</h3>

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
    </ul>

    <WhatsAppConnectionModal v-model:open="whatsappModalOpen" @linked="emit('changed')" />
  </div>
</template>
