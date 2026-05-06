<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check, ChevronDown } from 'lucide-vue-next';
import {
  Combobox,
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxTrigger,
  ComboboxViewport,
} from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import i18n, {
  LOCALE_OPTIONS,
  loadLocaleMessages,
  localeFlag,
  localeLabel,
  setI18nLanguage,
  translateStatic,
  type SupportedLocale,
} from '@/i18n';
import { setStoredLocale } from '@/lib/locale';

const props = withDefaults(
  defineProps<{
    /** Extra classes on the combobox root (e.g. `w-full`). */
    class?: string;
  }>(),
  {
    class: '',
  }
);

const { locale, t } = useI18n();

const switching = ref(false);

const current = computed(() => locale.value as SupportedLocale);
const currentLabel = computed(() => localeLabel(current.value));
const currentFlag = computed(() => localeFlag(current.value));

const triggerAriaLabel = computed(() => `${t('locale.switchLabel')}: ${currentLabel.value}`);

async function onModelUpdate(code: unknown): Promise<void> {
  const next = code as SupportedLocale;
  if (switching.value || next === current.value) return;
  switching.value = true;
  try {
    await loadLocaleMessages(i18n, next);
    setI18nLanguage(i18n, next);
    setStoredLocale(next);
    document.title = translateStatic('app.documentTitle');
  } finally {
    switching.value = false;
  }
}
</script>

<template>
  <Combobox
    :model-value="current"
    :disabled="switching"
    class="w-full"
    :class="cn(props.class)"
    @update:model-value="onModelUpdate"
  >
    <ComboboxAnchor class="flex w-full">
      <ComboboxTrigger as-child>
        <Button
          variant="outline"
          role="combobox"
          type="button"
          class="h-10 w-full justify-between px-3 font-normal"
          :disabled="switching"
          :aria-label="triggerAriaLabel"
        >
          <span class="flex min-w-0 items-center gap-2 truncate">
            <span class="text-lg leading-none" aria-hidden="true">{{ currentFlag }}</span>
            <span class="truncate">{{ currentLabel }}</span>
          </span>
          <ChevronDown class="size-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </ComboboxTrigger>
    </ComboboxAnchor>

    <ComboboxContent>
      <div class="border-b border-border px-2 py-2">
        <ComboboxInput :placeholder="t('locale.searchPlaceholder')" />
      </div>
      <ComboboxViewport class="p-1">
        <ComboboxEmpty>{{ t('locale.noResults') }}</ComboboxEmpty>
        <ComboboxItem
          v-for="opt in LOCALE_OPTIONS"
          :key="opt.code"
          :value="opt.code"
          :text-value="`${opt.label} ${opt.code}`"
          :disabled="switching"
        >
          <Check
            :class="
              cn(
                'size-4 shrink-0 text-primary',
                current === opt.code ? 'opacity-100' : 'opacity-0'
              )
            "
          />
          <span class="text-lg leading-none" aria-hidden="true">{{ opt.flag }}</span>
          <span class="min-w-0 flex-1 truncate">{{ opt.label }}</span>
          <span class="shrink-0 text-[10px] tabular-nums text-muted-foreground">{{
            opt.code
          }}</span>
        </ComboboxItem>
      </ComboboxViewport>
    </ComboboxContent>
  </Combobox>
</template>
