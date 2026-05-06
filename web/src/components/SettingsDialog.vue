<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Loader2,
  Trash2,
  X,
} from 'lucide-vue-next';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import SettingsAppearancePanel from './SettingsAppearancePanel.vue';
import ProviderIcon from './ProviderIcon.vue';
import {
  apiDeleteKey,
  apiListProviders,
  apiSaveKey,
  apiValidateKey,
  type ConnectionProviderId,
  type ProviderId,
  type ProviderInfo,
  type SettingsTab,
} from '@/lib/api';
import SettingsConnectionsPanel from './SettingsConnectionsPanel.vue';
import SettingsIntegrationsPanel from './SettingsIntegrationsPanel.vue';
import type { IntegrationsFooterState } from './SettingsIntegrationsPanel.vue';

const props = defineProps<{
  open: boolean;
  initialTab: SettingsTab;
  focusConnection?: ConnectionProviderId | null;
}>();

const emit = defineEmits<{
  'update:open': [boolean];
  saved: [];
}>();

const { t } = useI18n();

const providers = ref<ProviderInfo[]>([]);
const settingsTab = ref<SettingsTab>('providers');
const panel = ref<'list' | 'form'>('list');
const formMode = ref<'add' | 'replace'>('add');
/** Add: null until user picks from grid (or auto-pick if only one). Replace: set when opening. */
const formProviderId = ref<ProviderId | null>(null);
const keyDraft = ref('');
const formError = ref<string | null>(null);
const formBusy = ref(false);
const removeBusyId = ref<ProviderId | null>(null);
const integrationsPanelRef = ref<InstanceType<typeof SettingsIntegrationsPanel> | null>(null);
const integrationsFooter = ref<IntegrationsFooterState>({ variant: 'hidden' });

function onIntegrationsFooterState(state: IntegrationsFooterState): void {
  integrationsFooter.value = state;
}

const configuredProviders = computed(() => providers.value.filter((p) => p.hasApiKey));
const availableToAdd = computed(() => providers.value.filter((p) => !p.hasApiKey));

const formProvider = computed<ProviderInfo | undefined>(() =>
  formProviderId.value ? providers.value.find((p) => p.id === formProviderId.value) : undefined
);

const canSubmitForm = computed(() => {
  if (!formProviderId.value || !keyDraft.value.trim()) return false;
  return Boolean(formProvider.value);
});

async function refresh(): Promise<void> {
  providers.value = await apiListProviders();
}

onMounted(refresh);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      settingsTab.value = props.initialTab;
    } else {
      cancelForm();
    }
  }
);

function openAddForm(): void {
  formMode.value = 'add';
  formError.value = null;
  keyDraft.value = '';
  const avail = availableToAdd.value;
  formProviderId.value = avail.length === 1 ? avail[0]!.id : null;
  panel.value = 'form';
}

function openReplaceForm(p: ProviderInfo): void {
  formMode.value = 'replace';
  formProviderId.value = p.id;
  formError.value = null;
  keyDraft.value = '';
  panel.value = 'form';
}

function cancelForm(): void {
  panel.value = 'list';
  formProviderId.value = null;
  keyDraft.value = '';
  formError.value = null;
}

function selectProviderForAdd(id: ProviderId): void {
  formProviderId.value = id;
  formError.value = null;
}

function onFormKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
  if (!canSubmitForm.value || formBusy.value) return;
  e.preventDefault();
  void submitForm();
}

async function submitForm(): Promise<void> {
  const id = formProviderId.value;
  const key = keyDraft.value.trim();
  if (!id || !key) return;
  const p = providers.value.find((x) => x.id === id);
  if (!p) return;

  formError.value = null;
  formBusy.value = true;
  try {
    const validation = await apiValidateKey(id, key);
    if (!validation.ok) {
      formError.value = validation.error || t('settings.providers.invalidKey');
      return;
    }
    await apiSaveKey(id, key);
    keyDraft.value = '';
    await refresh();
    emit('saved');
    cancelForm();
  } catch (err) {
    formError.value = (err as Error).message;
  } finally {
    formBusy.value = false;
  }
}

async function removeKey(p: ProviderInfo): Promise<void> {
  removeBusyId.value = p.id;
  try {
    await apiDeleteKey(p.id);
    await refresh();
    emit('saved');
  } finally {
    removeBusyId.value = null;
  }
}

function onConnectionsChanged(): void {
  emit('saved');
}

function onIntegrationsChanged(): void {
  emit('saved');
}

function tabSectionTitle(tab: SettingsTab): string {
  switch (tab) {
    case 'providers':
      return t('settings.tabs.providers');
    case 'connections':
      return t('settings.connections.heading');
    case 'integrations':
      return t('settings.integrations.heading');
    case 'appearance':
      return t('settings.tabs.appearance');
  }
}

function tabSectionHint(tab: SettingsTab): string {
  switch (tab) {
    case 'providers':
      return t('settings.tabs.hints.providers');
    case 'connections':
      return t('settings.tabs.hints.connections');
    case 'integrations':
      return t('settings.tabs.hints.integrations');
    case 'appearance':
      return t('settings.tabs.hints.appearance');
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      class="flex h-[min(90dvh,40rem)] flex-col gap-0 overflow-hidden sm:max-w-lg"
    >
      <div class="mb-2 flex shrink-0 flex-col gap-1">
        <div class="flex items-center justify-between gap-3">
          <DialogTitle class="min-w-0 flex-1 text-base font-semibold leading-snug">{{
            t('settings.title')
          }}</DialogTitle>
          <DialogClose as-child>
            <Button variant="ghost" size="icon" type="button" class="shrink-0">
              <X class="size-4" />
            </Button>
          </DialogClose>
        </div>
        <p v-if="panel === 'form'" class="text-xs text-muted-foreground">
          {{
            formMode === 'add'
              ? t('settings.providers.formSubtitleAdd')
              : t('settings.providers.formSubtitleUpdate')
          }}
        </p>
      </div>

      <div class="min-h-0 flex-1 flex flex-col overflow-hidden">
      <!-- List panel: tab bar fixed, only panel body scrolls -->
      <div
        v-if="panel === 'list'"
        class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden"
      >
        <div
          class="flex shrink-0 rounded-lg border border-border bg-muted/40 p-1"
          role="tablist"
          :aria-label="t('settings.title')"
        >
          <button
            type="button"
            role="tab"
            class="flex-1 rounded-md px-3 py-2 text-center text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            :aria-selected="settingsTab === 'providers'"
            :class="
              cn(
                settingsTab === 'providers'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )
            "
            @click="settingsTab = 'providers'"
          >
            {{ t('settings.tabs.providers') }}
          </button>
          <button
            type="button"
            role="tab"
            class="flex-1 rounded-md px-3 py-2 text-center text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            :aria-selected="settingsTab === 'connections'"
            :class="
              cn(
                settingsTab === 'connections'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )
            "
            @click="settingsTab = 'connections'"
          >
            {{ t('settings.tabs.connections') }}
          </button>
          <button
            type="button"
            role="tab"
            class="flex-1 rounded-md px-3 py-2 text-center text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            :aria-selected="settingsTab === 'integrations'"
            :class="
              cn(
                settingsTab === 'integrations'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )
            "
            @click="settingsTab = 'integrations'"
          >
            {{ t('settings.tabs.integrations') }}
          </button>
          <button
            type="button"
            role="tab"
            class="flex-1 rounded-md px-3 py-2 text-center text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            :aria-selected="settingsTab === 'appearance'"
            :class="
              cn(
                settingsTab === 'appearance'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )
            "
            @click="settingsTab = 'appearance'"
          >
            {{ t('settings.tabs.appearance') }}
          </button>
        </div>

        <div class="flex shrink-0 flex-col gap-1 border-b border-border/60 pb-3">
          <h2 class="text-sm font-semibold leading-snug text-foreground">
            {{ tabSectionTitle(settingsTab) }}
          </h2>
          <p class="text-xs leading-snug text-muted-foreground">
            {{ tabSectionHint(settingsTab) }}
          </p>
        </div>

        <div
          class="min-h-0 flex-1 overflow-y-auto overscroll-contain pe-0.5 [scrollbar-gutter:stable]"
        >
        <div v-show="settingsTab === 'providers'" role="tabpanel" class="space-y-3">
        <h3 class="text-sm font-semibold leading-snug text-foreground">
          {{ t('settings.providers.connectedHeading') }}
        </h3>

        <div
          v-if="configuredProviders.length === 0"
          class="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground"
        >
          {{ t('settings.providers.emptyState') }}
        </div>

        <ul v-else class="space-y-2">
          <li
            v-for="p in configuredProviders"
            :key="p.id"
            class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
          >
            <div class="flex min-w-0 flex-1 items-center gap-2">
              <ProviderIcon :provider="p.id" :size="18" />
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
                :disabled="removeBusyId === p.id"
                @click="openReplaceForm(p)"
              >
                {{ t('settings.providers.updateKey') }}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                class="size-8"
                :aria-label="t('settings.providers.removeKeyAria')"
                :disabled="removeBusyId === p.id"
                @click="removeKey(p)"
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
        </div>

        <div v-show="settingsTab === 'connections'" role="tabpanel" class="space-y-3">
          <SettingsConnectionsPanel
            :auto-open-provider="focusConnection"
            @changed="onConnectionsChanged"
          />
        </div>

        <div v-show="settingsTab === 'integrations'" role="tabpanel" class="space-y-3">
          <SettingsIntegrationsPanel
            ref="integrationsPanelRef"
            @changed="onIntegrationsChanged"
            @footer-state="onIntegrationsFooterState"
          />
        </div>

        <div v-show="settingsTab === 'appearance'" role="tabpanel" class="space-y-3">
          <SettingsAppearancePanel />
        </div>
        </div>
      </div>

      <!-- Form panel -->
      <div
        v-else
        class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pe-0.5 [scrollbar-gutter:stable]"
      >
        <Button variant="ghost" size="sm" class="-ms-2 gap-1 px-2 text-muted-foreground" @click="cancelForm">
          <ArrowLeft class="size-4 rtl:scale-x-[-1]" />
          {{ t('settings.providers.back') }}
        </Button>

        <div class="space-y-2">
          <Label class="text-muted-foreground">{{ t('settings.providers.providerLabel') }}</Label>
          <div class="rounded-lg border border-border bg-muted/30 p-3">
            <template v-if="formMode === 'replace' && formProvider">
              <div class="flex items-center gap-2">
                <ProviderIcon :provider="formProvider.id" :size="22" />
                <span class="text-sm font-medium">{{ formProvider.label }}</span>
              </div>
            </template>
            <div v-else class="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button
                v-for="p in availableToAdd"
                :key="p.id"
                type="button"
                class="flex flex-col items-center gap-1.5 rounded-md border bg-background px-2 py-3 text-xs font-medium transition"
                :class="
                  formProviderId === p.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input text-muted-foreground hover:bg-accent'
                "
                @click="selectProviderForAdd(p.id)"
              >
                <ProviderIcon :provider="p.id" :size="22" />
                {{ p.label }}
              </button>
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <Label class="text-muted-foreground" for="settings-api-key">{{
            t('settings.providers.apiKeyLabel')
          }}</Label>
          <Input
            id="settings-api-key"
            v-model="keyDraft"
            type="password"
            class="h-10"
            :placeholder="formProvider?.apiKeyHint ?? t('settings.providers.pasteKeyPlaceholder')"
            :disabled="formBusy"
            @keydown.enter="onFormKeydown"
          />
        </div>

        <a
          v-if="formProvider"
          :href="formProvider.apiKeyHelpUrl"
          target="_blank"
          rel="noreferrer"
          class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {{ t('settings.providers.getApiKeyLink') }}
          <ExternalLink class="size-3" />
        </a>
        <p v-if="formError" class="text-sm text-destructive">{{ formError }}</p>
      </div>
      </div>

      <div
        class="mt-6 shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4"
      >
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <template v-if="panel === 'list' && settingsTab === 'providers'">
            <Button
              variant="outline"
              :disabled="availableToAdd.length === 0"
              @click="openAddForm"
            >
              {{ t('settings.providers.addProvider') }}
            </Button>
            <span v-if="availableToAdd.length === 0" class="text-xs text-muted-foreground">
              {{ t('settings.providers.allConnected') }}
            </span>
          </template>
          <template v-else-if="panel === 'list' && settingsTab === 'integrations'">
            <template v-if="integrationsFooter.variant === 'list-add'">
              <Button
                variant="outline"
                :disabled="integrationsFooter.disabled"
                @click="integrationsPanelRef?.openPicker()"
              >
                {{ t('settings.integrations.addIntegration') }}
              </Button>
              <span
                v-if="integrationsFooter.allConnectedHint"
                class="text-xs text-muted-foreground"
              >
                {{ t('settings.integrations.allConnected') }}
              </span>
            </template>
            <Button
              v-else-if="integrationsFooter.variant === 'form-save'"
              :disabled="integrationsFooter.disabled"
              @click="integrationsPanelRef?.save()"
            >
              <Loader2 v-if="integrationsFooter.pending" class="size-4 animate-spin" />
              {{ integrationsFooter.label }}
            </Button>
          </template>
          <Button
            v-else-if="panel === 'form'"
            :disabled="formBusy || !canSubmitForm"
            @click="submitForm"
          >
            <Loader2 v-if="formBusy" class="size-4 animate-spin" />
            {{
              formBusy ? t('settings.providers.validating') : t('settings.providers.validateSave')
            }}
          </Button>
        </div>
        <DialogClose as-child>
          <Button variant="secondary" type="button">{{ t('settings.done') }}</Button>
        </DialogClose>
      </div>
    </DialogContent>
  </Dialog>
</template>
