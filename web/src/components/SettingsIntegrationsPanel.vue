<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check, ExternalLink, Loader2 } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  apiDeleteGiphyKey,
  apiGetGiphyIntegration,
  apiSaveGiphyKey,
} from '@/lib/api';

const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();

const busy = ref(false);
const saveBusy = ref(false);
const removeBusy = ref(false);
const error = ref<string | null>(null);
const configured = ref(false);
const apiKeyMasked = ref<string | null>(null);
const keyDraft = ref('');

async function load(): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    const s = await apiGetGiphyIntegration();
    configured.value = s.configured;
    apiKeyMasked.value = s.apiKeyMasked;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

onMounted(load);

async function save(): Promise<void> {
  const key = keyDraft.value.trim();
  if (!key) return;
  saveBusy.value = true;
  error.value = null;
  try {
    const r = await apiSaveGiphyKey(key);
    keyDraft.value = '';
    apiKeyMasked.value = r.apiKeyMasked;
    configured.value = true;
    emit('changed');
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saveBusy.value = false;
  }
}

async function remove(): Promise<void> {
  removeBusy.value = true;
  error.value = null;
  try {
    await apiDeleteGiphyKey();
    configured.value = false;
    apiKeyMasked.value = null;
    emit('changed');
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    removeBusy.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <h3 class="text-sm font-medium">{{ t('settings.integrations.heading') }}</h3>
      <p class="mt-1 text-xs text-muted-foreground">
        {{ t('settings.integrations.description') }}
      </p>
    </div>

    <div
      class="rounded-lg border border-border bg-muted/20 px-3 py-3 space-y-3"
      :aria-busy="busy"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-sm font-semibold">{{ t('settings.integrations.giphy.title') }}</span>
        <a
          href="https://developers.giphy.com/dashboard/"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {{ t('settings.integrations.giphy.getKey') }}
          <ExternalLink class="size-3" />
        </a>
      </div>

      <p class="text-[11px] leading-snug text-muted-foreground">
        {{ t('settings.integrations.giphy.noteAttribution') }}
      </p>
      <p class="text-[11px] leading-snug text-muted-foreground">
        {{ t('settings.integrations.giphy.noteRateLimit') }}
      </p>
      <p class="text-[11px] leading-snug text-muted-foreground">
        {{ t('settings.integrations.giphy.noteEnv') }}
      </p>

      <div v-if="busy" class="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 class="size-4 animate-spin" />
        {{ t('settings.integrations.loading') }}
      </div>

      <template v-else>
        <div v-if="configured && apiKeyMasked" class="flex flex-wrap items-center gap-2">
          <span
            class="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] tabular-nums text-emerald-600 dark:text-emerald-400"
          >
            <Check class="size-3 shrink-0" />
            {{ apiKeyMasked }}
          </span>
          <Button
            variant="ghost"
            size="sm"
            class="h-8 text-xs gap-1.5"
            :disabled="removeBusy"
            @click="remove"
          >
            <Loader2 v-if="removeBusy" class="size-4 animate-spin shrink-0" />
            <span>{{ t('settings.integrations.giphy.removeKey') }}</span>
          </Button>
        </div>

        <div class="space-y-2">
          <Label class="text-muted-foreground text-xs" for="giphy-api-key">{{
            t('settings.integrations.giphy.apiKeyLabel')
          }}</Label>
          <Input
            id="giphy-api-key"
            v-model="keyDraft"
            type="password"
            autocomplete="off"
            class="font-mono text-xs"
            :placeholder="t('settings.integrations.giphy.placeholder')"
            @keydown.enter.prevent="save"
          />
          <Button
            size="sm"
            class="w-full sm:w-auto"
            :disabled="saveBusy || !keyDraft.trim()"
            @click="save"
          >
            <Loader2 v-if="saveBusy" class="size-4 animate-spin" />
            <template v-else>{{ t('settings.integrations.giphy.save') }}</template>
          </Button>
        </div>
      </template>

      <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
    </div>
  </div>
</template>
