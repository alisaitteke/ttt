<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowLeft, Check, ExternalLink, Loader2, Trash2 } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import IntegrationIcon from '@/components/IntegrationIcon.vue';
import {
  apiDeleteIntegrationKey,
  apiListIntegrations,
  apiSaveIntegrationKey,
  type IntegrationId,
  type IntegrationInfo,
} from '@/lib/api';

const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();

const integrations = ref<IntegrationInfo[]>([]);
const busy = ref(false);
const saveBusy = ref(false);
const removeBusyId = ref<IntegrationId | null>(null);
const error = ref<string | null>(null);
const keyDraft = ref('');
const searchQuery = ref('');

type PanelView = 'list' | 'picker' | 'form';
const view = ref<PanelView>('list');
const formMode = ref<'add' | 'replace'>('add');
const formIntegrationId = ref<IntegrationId | null>(null);
const formReturnView = ref<'list' | 'picker'>('list');

const configuredIntegrations = computed(() =>
  integrations.value.filter((x) => x.availability === 'active' && x.hasApiKey)
);

const comingSoonIntegrations = computed(() =>
  integrations.value.filter((x) => x.availability === 'coming_soon')
);

const availableToAdd = computed(() =>
  integrations.value.filter((x) => x.availability === 'active' && !x.hasApiKey)
);

const filteredAvailable = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const items = availableToAdd.value;
  if (!q) return items;
  return items.filter(
    (x) => x.label.toLowerCase().includes(q) || String(x.id).toLowerCase().includes(q)
  );
});

const formIntegration = computed<IntegrationInfo | undefined>(() =>
  formIntegrationId.value
    ? integrations.value.find((x) => x.id === formIntegrationId.value)
    : undefined
);

async function load(): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    integrations.value = await apiListIntegrations();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

onMounted(load);

function openPicker(): void {
  searchQuery.value = '';
  error.value = null;
  view.value = 'picker';
}

function openReplaceForm(id: IntegrationId): void {
  formMode.value = 'replace';
  formIntegrationId.value = id;
  formReturnView.value = 'list';
  keyDraft.value = '';
  error.value = null;
  view.value = 'form';
}

function pickIntegration(id: IntegrationId): void {
  formMode.value = 'add';
  formIntegrationId.value = id;
  formReturnView.value = 'picker';
  keyDraft.value = '';
  error.value = null;
  view.value = 'form';
}

function backFromPicker(): void {
  searchQuery.value = '';
  view.value = 'list';
}

function backFromForm(): void {
  keyDraft.value = '';
  error.value = null;
  formIntegrationId.value = null;
  view.value = formReturnView.value === 'picker' ? 'picker' : 'list';
}

async function save(): Promise<void> {
  const id = formIntegrationId.value;
  const key = keyDraft.value.trim();
  if (!id || !key) return;
  saveBusy.value = true;
  error.value = null;
  try {
    await apiSaveIntegrationKey(id, key);
    keyDraft.value = '';
    await load();
    emit('changed');
    view.value = 'list';
    formIntegrationId.value = null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saveBusy.value = false;
  }
}

async function removeKey(id: IntegrationId): Promise<void> {
  removeBusyId.value = id;
  error.value = null;
  try {
    await apiDeleteIntegrationKey(id);
    await load();
    emit('changed');
    if (formIntegrationId.value === id && view.value === 'form') {
      backFromForm();
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    removeBusyId.value = null;
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- List -->
    <template v-if="view === 'list'">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <h3 class="text-sm font-medium">{{ t('settings.integrations.heading') }}</h3>
        </div>
        <Button
          v-if="!busy"
          variant="outline"
          size="sm"
          class="shrink-0"
          @click="openPicker"
        >
          {{ t('settings.integrations.addIntegration') }}
        </Button>
      </div>

      <div v-if="busy" class="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 class="size-4 animate-spin" />
        {{ t('settings.integrations.loading') }}
      </div>

      <template v-else>
        <h4 class="text-xs font-medium text-muted-foreground">
          {{ t('settings.integrations.connectedHeading') }}
        </h4>

        <div
          v-if="configuredIntegrations.length === 0"
          class="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground"
        >
          {{ t('settings.integrations.emptyState') }}
        </div>

        <ul v-else class="space-y-2">
          <li
            v-for="p in configuredIntegrations"
            :key="p.id"
            class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
          >
            <div class="flex min-w-0 flex-1 items-center gap-2">
              <IntegrationIcon :integration="p.id" :size="18" />
              <span class="truncate text-sm font-semibold">{{ p.label }}</span>
              <span
                v-if="p.apiKeyMasked"
                class="inline-flex max-w-[10rem] shrink-0 items-center gap-1 truncate rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] tabular-nums text-emerald-600 dark:text-emerald-400"
              >
                <Check class="size-3 shrink-0" />
                {{ p.apiKeyMasked }}
              </span>
            </div>
            <div class="flex shrink-0 flex-wrap items-center justify-end gap-1">
              <a
                :href="p.apiKeyHelpUrl"
                target="_blank"
                rel="noreferrer"
                class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {{ t('settings.providers.getKey') }}
                <ExternalLink class="size-3" />
              </a>
              <Button
                variant="ghost"
                size="sm"
                class="h-8 text-xs"
                @click="openReplaceForm(p.id)"
              >
                {{ t('settings.providers.updateKey') }}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                class="size-8"
                :aria-label="t('settings.providers.removeKeyAria')"
                :disabled="removeBusyId === p.id"
                @click="removeKey(p.id)"
              >
                <Loader2
                  v-if="removeBusyId === p.id"
                  class="size-4 animate-spin text-muted-foreground"
                />
                <Trash2 v-else class="size-4 text-muted-foreground" />
              </Button>
            </div>
          </li>
        </ul>

        <p
          v-if="availableToAdd.length === 0 && integrations.filter((x) => x.availability === 'active').length > 0"
          class="text-xs text-muted-foreground"
        >
          {{ t('settings.integrations.allConnected') }}
        </p>

        <template v-if="comingSoonIntegrations.length > 0">
          <h4 class="mt-6 text-xs font-medium text-muted-foreground">
            {{ t('settings.integrations.comingSoonHeading') }}
          </h4>
          <ul class="space-y-2">
            <li
              v-for="p in comingSoonIntegrations"
              :key="p.id"
              class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-muted/10 px-3 py-2.5 opacity-80"
              aria-disabled="true"
            >
              <div class="flex min-w-0 flex-1 items-center gap-2">
                <IntegrationIcon :integration="p.id" :size="18" />
                <span class="truncate text-sm font-semibold text-muted-foreground">{{ p.label }}</span>
              </div>
              <span
                class="inline-flex shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {{ t('settings.integrations.comingSoonBadge') }}
              </span>
            </li>
          </ul>
        </template>

        <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
      </template>
    </template>

    <!-- Picker -->
    <template v-else-if="view === 'picker'">
      <Button variant="ghost" size="sm" class="-ms-2 gap-1 px-2 text-muted-foreground" @click="backFromPicker">
        <ArrowLeft class="size-4 rtl:scale-x-[-1]" />
        {{ t('settings.providers.back') }}
      </Button>

      <div>
        <h3 class="text-sm font-medium">{{ t('settings.integrations.addIntegration') }}</h3>
        <p class="mt-1 text-xs text-muted-foreground">{{ t('settings.integrations.pickerHint') }}</p>
      </div>

      <Input
        v-model="searchQuery"
        type="search"
        class="text-sm"
        :placeholder="t('settings.integrations.searchPlaceholder')"
        autocomplete="off"
      />

      <p
        v-if="filteredAvailable.length === 0 && !searchQuery.trim()"
        class="text-xs text-muted-foreground"
      >
        {{ t('settings.integrations.allConnected') }}
      </p>

      <p
        v-else-if="filteredAvailable.length === 0 && searchQuery.trim()"
        class="text-xs text-muted-foreground"
      >
        {{ t('settings.integrations.noSearchResults') }}
      </p>

      <div v-else class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button
          v-for="p in filteredAvailable"
          :key="p.id"
          type="button"
          class="flex flex-col items-center gap-1.5 rounded-md border border-input bg-background px-2 py-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
          @click="pickIntegration(p.id)"
        >
          <IntegrationIcon :integration="p.id" :size="22" />
          <span class="text-center leading-tight">{{ p.label }}</span>
        </button>
      </div>
    </template>

    <!-- Form -->
    <template v-else-if="view === 'form' && formIntegration">
      <Button variant="ghost" size="sm" class="-ms-2 gap-1 px-2 text-muted-foreground" @click="backFromForm">
        <ArrowLeft class="size-4 rtl:scale-x-[-1]" />
        {{ t('settings.providers.back') }}
      </Button>

      <div
        class="rounded-lg border border-border bg-muted/20 px-3 py-3 space-y-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <IntegrationIcon :integration="formIntegration.id" :size="20" />
            <span class="text-sm font-semibold">{{ formIntegration.label }}</span>
          </div>
          <a
            :href="formIntegration.apiKeyHelpUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {{
              formIntegration.id === 'giphy'
                ? t('settings.integrations.giphy.getKey')
                : t('settings.providers.getKey')
            }}
            <ExternalLink class="size-3" />
          </a>
        </div>

        <template v-if="formIntegration.id === 'giphy'">
          <p class="text-[11px] leading-snug text-muted-foreground">
            {{ t('settings.integrations.giphy.noteAttribution') }}
          </p>
          <p class="text-[11px] leading-snug text-muted-foreground">
            {{ t('settings.integrations.giphy.noteRateLimit') }}
          </p>
          <p class="text-[11px] leading-snug text-muted-foreground">
            {{ t('settings.integrations.giphy.noteEnv') }}
          </p>
        </template>

        <div v-if="formMode === 'replace' && formIntegration.hasApiKey && formIntegration.apiKeyMasked" class="flex flex-wrap items-center gap-2">
          <span
            class="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] tabular-nums text-emerald-600 dark:text-emerald-400"
          >
            <Check class="size-3 shrink-0" />
            {{ formIntegration.apiKeyMasked }}
          </span>
          <Button
            variant="ghost"
            size="sm"
            class="h-8 text-xs gap-1.5"
            :disabled="removeBusyId === formIntegration.id"
            @click="removeKey(formIntegration.id)"
          >
            <Loader2 v-if="removeBusyId === formIntegration.id" class="size-4 animate-spin shrink-0" />
            <span>{{
              formIntegration.id === 'giphy'
                ? t('settings.integrations.giphy.removeKey')
                : t('settings.providers.removeKeyAria')
            }}</span>
          </Button>
        </div>

        <div class="space-y-2">
          <Label
            class="text-muted-foreground text-xs"
            :for="`integration-api-key-${formIntegration.id}`"
          >{{
            formIntegration.id === 'giphy'
              ? t('settings.integrations.giphy.apiKeyLabel')
              : t('settings.providers.apiKeyLabel')
          }}</Label>
          <Input
            :id="`integration-api-key-${formIntegration.id}`"
            v-model="keyDraft"
            type="password"
            autocomplete="off"
            class="font-mono text-xs"
            :placeholder="
              formIntegration.id === 'giphy'
                ? t('settings.integrations.giphy.placeholder')
                : t('settings.providers.pasteKeyPlaceholder')
            "
            @keydown.enter.prevent="save"
          />
          <Button
            size="sm"
            class="w-full sm:w-auto"
            :disabled="saveBusy || !keyDraft.trim()"
            @click="save"
          >
            <Loader2 v-if="saveBusy" class="size-4 animate-spin" />
            <template v-else>{{
              formIntegration.id === 'giphy'
                ? t('settings.integrations.giphy.save')
                : t('settings.providers.validateSave')
            }}</template>
          </Button>
        </div>

        <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
      </div>
    </template>
  </div>
</template>
