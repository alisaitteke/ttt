<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Loader2,
  Trash2,
  X,
} from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ProviderIcon from './ProviderIcon.vue';
import {
  apiDeleteKey,
  apiListProviders,
  apiSaveKey,
  apiValidateKey,
  type ProviderId,
  type ProviderInfo,
} from '@/lib/api';

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const providers = ref<ProviderInfo[]>([]);
const panel = ref<'list' | 'form'>('list');
const formMode = ref<'add' | 'replace'>('add');
/** Add: null until user picks from grid (or auto-pick if only one). Replace: set when opening. */
const formProviderId = ref<ProviderId | null>(null);
const keyDraft = ref('');
const formError = ref<string | null>(null);
const formBusy = ref(false);
const removeBusyId = ref<ProviderId | null>(null);

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
      formError.value = validation.error || 'Invalid key';
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
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-lg">
      <div class="mb-4 flex items-center justify-between">
        <div class="min-w-0">
          <h2 class="text-base font-semibold">Settings</h2>
          <p v-if="panel === 'form'" class="mt-0.5 text-xs text-muted-foreground">
            {{ formMode === 'add' ? 'Add provider' : 'Update API key' }}
          </p>
        </div>
        <Button variant="ghost" size="icon" @click="emit('close')">
          <X class="size-4" />
        </Button>
      </div>

      <!-- List panel -->
      <div v-if="panel === 'list'" class="space-y-3">
        <h3 class="text-sm font-medium">Connected providers</h3>

        <div
          v-if="configuredProviders.length === 0"
          class="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground"
        >
          No providers connected yet. Add an API key to get started.
        </div>

        <ul v-else class="max-h-[min(50vh,20rem)] space-y-2 overflow-y-auto pr-0.5">
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
                Get key
                <ExternalLink class="size-3" />
              </a>
              <Button
                variant="ghost"
                size="sm"
                class="h-8 text-xs"
                :disabled="removeBusyId === p.id"
                @click="openReplaceForm(p)"
              >
                Update key
              </Button>
              <Button
                size="icon"
                variant="ghost"
                class="size-8"
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

      <!-- Form panel -->
      <div v-else class="space-y-4">
        <Button variant="ghost" size="sm" class="-ml-2 gap-1 px-2 text-muted-foreground" @click="cancelForm">
          <ArrowLeft class="size-4" />
          Back
        </Button>

        <template v-if="formMode === 'replace' && formProvider">
          <div class="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <ProviderIcon :provider="formProvider.id" :size="22" />
            <span class="text-sm font-medium">{{ formProvider.label }}</span>
          </div>
        </template>

        <template v-else>
          <div class="space-y-2">
            <Label>Provider</Label>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button
                v-for="p in availableToAdd"
                :key="p.id"
                type="button"
                class="flex flex-col items-center gap-1.5 rounded-md border px-2 py-3 text-xs font-medium transition"
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
        </template>

        <div class="space-y-2">
          <Label for="settings-api-key">API key</Label>
          <Input
            id="settings-api-key"
            v-model="keyDraft"
            type="password"
            :placeholder="formProvider?.apiKeyHint ?? 'Paste your API key…'"
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
          Get an API key
          <ExternalLink class="size-3" />
        </a>
        <p v-if="formError" class="text-sm text-destructive">{{ formError }}</p>

        <Button
          class="w-full"
          :disabled="formBusy || !canSubmitForm"
          @click="submitForm"
        >
          <Loader2 v-if="formBusy" class="size-4 animate-spin" />
          {{ formBusy ? 'Validating…' : 'Validate & save' }}
        </Button>
      </div>

      <div class="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <template v-if="panel === 'list'">
            <Button
              variant="outline"
              :disabled="availableToAdd.length === 0"
              @click="openAddForm"
            >
              Add provider
            </Button>
            <span v-if="availableToAdd.length === 0" class="text-xs text-muted-foreground">
              All providers connected
            </span>
          </template>
        </div>
        <Button variant="secondary" @click="emit('close')">Done</Button>
      </div>
    </div>
  </div>
</template>
