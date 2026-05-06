<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import QRCode from 'qrcode';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  apiGetWhatsAppPreferences,
  apiLogoutWhatsApp,
  apiPatchWhatsAppPreferences,
  apiStartWhatsAppPairing,
  ApiError,
} from '@/lib/api';
import { Loader2, X } from 'lucide-vue-next';

const open = defineModel<boolean>('open', { required: true });

const emit = defineEmits<{
  linked: [];
}>();

const { t } = useI18n();

const status = ref<'idle' | 'pairing' | 'connected' | 'error'>('idle');
const errorMessage = ref<string | null>(null);
const qrDataUrl = ref<string | null>(null);
const extendedData = ref(false);
const prefsLoading = ref(false);
let es: EventSource | null = null;

async function bustDesignToolsCache(): Promise<void> {
  try {
    await fetch('/api/design-tools?nocache=1');
  } catch {
    /* ignore */
  }
}

function closeStream(): void {
  es?.close();
  es = null;
}

async function renderQr(raw: string): Promise<void> {
  try {
    qrDataUrl.value = await QRCode.toDataURL(raw, { margin: 1, width: 280 });
  } catch {
    qrDataUrl.value = null;
  }
}

async function loadPrefs(): Promise<void> {
  prefsLoading.value = true;
  try {
    const p = await apiGetWhatsAppPreferences();
    extendedData.value = p.extendedDataTools;
  } catch {
    extendedData.value = false;
  } finally {
    prefsLoading.value = false;
  }
}

async function onExtendedToggle(checked: boolean): Promise<void> {
  extendedData.value = checked;
  try {
    await apiPatchWhatsAppPreferences({ extendedDataTools: checked });
  } catch {
    /* revert on failure */
    extendedData.value = !checked;
  }
}

async function startPairing(): Promise<void> {
  status.value = 'pairing';
  errorMessage.value = null;
  qrDataUrl.value = null;
  closeStream();
  try {
    await apiStartWhatsAppPairing();
  } catch (e) {
    status.value = 'error';
    errorMessage.value = e instanceof ApiError ? e.message : (e as Error).message;
    return;
  }

  es = new EventSource('/api/connections/whatsapp/events');
  es.addEventListener('snapshot', (ev) => {
    try {
      const d = JSON.parse((ev as MessageEvent).data) as { connected?: boolean };
      if (d.connected) {
        status.value = 'connected';
        qrDataUrl.value = null;
        void bustDesignToolsCache();
        emit('linked');
      }
    } catch {
      /* ignore */
    }
  });
  es.addEventListener('qr', (ev) => {
    try {
      const p = JSON.parse((ev as MessageEvent).data) as { raw?: string };
      if (p.raw) void renderQr(p.raw);
    } catch {
      /* ignore */
    }
  });
  es.addEventListener('connected', () => {
    status.value = 'connected';
    qrDataUrl.value = null;
    void bustDesignToolsCache();
    emit('linked');
  });
  es.addEventListener('disconnected', (ev) => {
    try {
      const p = JSON.parse((ev as MessageEvent).data) as {
        reason?: string;
        statusCode?: number;
      };
      if (status.value === 'connected') return;
      const code = p.statusCode;
      if (code === 405) {
        status.value = 'error';
        errorMessage.value = t('connections.whatsapp.errors.clientVersion');
        return;
      }
      if (
        code === 403 ||
        code === 411 ||
        code === 500 ||
        code === 419
      ) {
        status.value = 'error';
        errorMessage.value = t('connections.whatsapp.errors.sessionRejected');
        return;
      }
      status.value = 'pairing';
    } catch {
      if (status.value !== 'connected') status.value = 'pairing';
    }
  });
  es.addEventListener('stream_error', (ev) => {
    try {
      const p = JSON.parse((ev as MessageEvent).data) as { message?: string };
      if (p.message) {
        errorMessage.value = p.message;
        status.value = 'error';
      }
    } catch {
      /* ignore */
    }
  });
  es.onerror = () => {
    /* browser may retry */
  };
}

watch(
  () => open.value,
  (v) => {
    if (v) {
      void loadPrefs();
      void startPairing();
    } else closeStream();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  closeStream();
});

async function onLogout(): Promise<void> {
  closeStream();
  try {
    await apiLogoutWhatsApp();
  } catch {
    /* still reset UI */
  }
  status.value = 'idle';
  qrDataUrl.value = null;
  errorMessage.value = null;
  await loadPrefs();
}

defineExpose({
  restart: startPairing,
});
</script>

<template>
  <Dialog
    :open="open"
    @update:open="
      (v) => {
        open = v;
        if (!v) closeStream();
      }
    "
  >
    <DialogContent class="max-w-sm gap-4 p-5">
      <DialogHeader class="space-y-1">
        <DialogTitle class="text-base">{{ t('connections.whatsapp.title') }}</DialogTitle>
        <p class="text-xs text-muted-foreground">
          {{ t('connections.whatsapp.blurb') }}
        </p>
      </DialogHeader>

      <div
        class="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground"
      >
        <p class="font-medium text-foreground">{{ t('connections.whatsapp.consent.title') }}</p>
        <p>{{ t('connections.whatsapp.consent.body') }}</p>
        <label class="flex cursor-pointer items-start gap-2 text-foreground">
          <input
            type="checkbox"
            class="mt-0.5 size-3.5 shrink-0 rounded border border-input"
            :checked="extendedData"
            :disabled="prefsLoading"
            @change="onExtendedToggle(($event.target as HTMLInputElement).checked)"
          />
          <span>{{ t('connections.whatsapp.consent.checkbox') }}</span>
        </label>
      </div>

      <div class="flex flex-col items-center gap-3">
        <template v-if="status === 'connected'">
          <p class="text-center text-sm text-emerald-600 dark:text-emerald-400">
            {{ t('connections.whatsapp.linked') }}
          </p>
        </template>
        <template v-else-if="status === 'error'">
          <p class="text-center text-sm text-destructive">{{ errorMessage }}</p>
        </template>
        <template v-else>
          <p v-if="!qrDataUrl" class="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 class="size-4 animate-spin" />
            {{ t('connections.whatsapp.waitingQr') }}
          </p>
          <img
            v-else
            :src="qrDataUrl"
            alt=""
            class="size-[280px] max-w-full rounded-lg border border-border bg-white p-2"
          />
          <p class="text-center text-xs text-muted-foreground">
            {{ t('connections.whatsapp.scanHint') }}
          </p>
        </template>
      </div>

      <div class="flex flex-wrap justify-end gap-2">
        <Button v-if="status === 'error'" variant="outline" size="sm" @click="startPairing">
          {{ t('connections.whatsapp.retry') }}
        </Button>
        <Button v-if="status === 'connected'" variant="outline" size="sm" @click="onLogout">
          {{ t('connections.whatsapp.forget') }}
        </Button>
        <DialogClose as-child>
          <Button variant="secondary" size="sm" type="button">
            <X class="me-1 size-4" />
            {{ t('settings.done') }}
          </Button>
        </DialogClose>
      </div>
    </DialogContent>
  </Dialog>
</template>
