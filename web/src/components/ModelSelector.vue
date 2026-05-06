<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronDown, Check, Lock } from 'lucide-vue-next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import ProviderIcon from './ProviderIcon.vue';
import type { ProviderId, ProviderInfo, ProviderModel } from '@/lib/api';

const props = defineProps<{
  providers: ProviderInfo[];
  currentProvider: ProviderId;
  currentModel: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:provider': [value: ProviderId];
  'update:model': [value: string];
  'open-settings': [tab: 'appearance' | 'providers'];
}>();

const { t } = useI18n();

const open = ref(false);

const provider = computed<ProviderInfo | undefined>(() =>
  props.providers.find((p) => p.id === props.currentProvider)
);

const model = computed(() =>
  provider.value?.models.find((m) => m.id === props.currentModel)
);

const triggerAriaLabel = computed(
  () =>
    `${t('model.triggerAriaPrefix')}${
      model.value?.label ?? t('model.selectModelFallback')
    }`
);

function openSettings(): void {
  open.value = false;
  emit('open-settings', 'providers');
}

function onModelClick(prov: ProviderInfo, mdl: ProviderModel): void {
  if (!prov.hasApiKey) {
    openSettings();
    return;
  }
  if (prov.id !== props.currentProvider) {
    emit('update:provider', prov.id);
  }
  if (mdl.id !== props.currentModel) {
    emit('update:model', mdl.id);
  }
  open.value = false;
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        size="sm"
        :disabled="disabled"
        class="h-7 gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground md:gap-1.5 md:px-2"
        :aria-label="triggerAriaLabel"
      >
        <ProviderIcon :provider="currentProvider" :size="14" />
        <span class="hidden font-normal md:inline">
          {{ t('model.labelPrefix') }}
          <span class="font-medium text-foreground">
            {{ model?.label ?? t('model.selectModelFallback') }}
          </span>
        </span>
        <ChevronDown class="size-3.5 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-80 p-0" align="start" side="top">
      <div class="border-b border-border/50 px-3 py-2.5">
        <div class="flex min-w-0 items-center justify-between gap-3">
          <span class="text-xs font-medium text-muted-foreground">{{ t('model.panelHeading') }}</span>
          <button
            type="button"
            class="text-[10px] text-primary hover:underline"
            @click="openSettings"
          >
            {{ t('model.settingsLink') }}
          </button>
        </div>
      </div>
      <div class="max-h-96 overflow-y-auto">
        <div
          v-for="prov in providers"
          :key="prov.id"
          class="border-b border-border/50 last:border-0"
        >
          <div
            class="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border/50 bg-popover px-3 py-1.5 text-xs font-medium text-muted-foreground"
          >
            <span class="flex min-w-0 flex-1 items-center gap-1.5 truncate">
              <ProviderIcon :provider="prov.id" :size="14" />
              <span class="truncate">{{ prov.label }}</span>
            </span>
            <button
              v-if="prov.hasApiKey && prov.apiKeyMasked"
              type="button"
              class="max-w-[10rem] shrink-0 truncate text-start font-mono text-[10px] font-medium tabular-nums tracking-tight text-muted-foreground hover:text-foreground hover:underline bidi-plain"
              :title="t('model.manageKeyTitle')"
              @click.stop="openSettings"
            >
              {{ prov.apiKeyMasked }}
            </button>
            <button
              v-else-if="!prov.hasApiKey"
              type="button"
              class="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-primary hover:underline"
              @click.stop="openSettings"
            >
              <Lock class="size-3" />
              {{ t('model.addApiKey') }}
            </button>
          </div>
          <div class="ms-3 me-2 border-s border-border/50 py-1 ps-3">
            <button
              v-for="mdl in prov.models"
              :key="mdl.id"
              type="button"
              class="flex w-full items-center gap-2 rounded-sm py-2 pe-3 ps-1 text-start text-sm"
              :class="[
                prov.hasApiKey
                  ? 'hover:bg-accent'
                  : 'opacity-50 hover:bg-muted/30',
                prov.id === currentProvider && mdl.id === currentModel
                  ? 'bg-accent'
                  : '',
              ]"
              @click="onModelClick(prov, mdl)"
            >
              <Check
                v-if="prov.hasApiKey"
                class="size-4 shrink-0"
                :class="
                  prov.id === currentProvider && mdl.id === currentModel
                    ? 'opacity-100'
                    : 'opacity-0'
                "
              />
              <Lock v-else class="size-3.5 shrink-0 text-muted-foreground" />
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium">{{ mdl.label }}</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
