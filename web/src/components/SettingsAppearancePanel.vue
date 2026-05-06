<script setup lang="ts">
import type { Component } from 'vue';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { AlertTriangle, Monitor, Moon, Sun } from 'lucide-vue-next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import LocaleSwitcher from '@/components/LocaleSwitcher.vue';
import {
  getThemePreference,
  setThemePreference,
  type ThemePreference,
} from '@/lib/theme';

const { t } = useI18n();

const themePref = ref<ThemePreference>('system');

function syncThemePref(): void {
  themePref.value = getThemePreference();
}

function pickTheme(pref: ThemePreference): void {
  setThemePreference(pref);
  themePref.value = pref;
}

onMounted(() => {
  syncThemePref();
});

const themeChoices: { value: ThemePreference; icon: Component; labelKey: string }[] = [
  { value: 'system', icon: Monitor, labelKey: 'settings.theme.system' },
  { value: 'light', icon: Sun, labelKey: 'settings.theme.light' },
  { value: 'dark', icon: Moon, labelKey: 'settings.theme.dark' },
];
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <Label class="text-muted-foreground">{{ t('locale.switchLabel') }}</Label>
      <LocaleSwitcher />
      <div
        class="flex gap-2 rounded-md border border-amber-200/80 bg-amber-50/90 px-2.5 py-2 text-xs leading-relaxed text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
        role="note"
      >
        <AlertTriangle class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <p>{{ t('settings.locale.responseHint') }}</p>
      </div>
    </div>

    <div class="space-y-2">
      <Label class="text-muted-foreground">{{ t('settings.theme.label') }}</Label>
      <div
        class="flex w-full gap-1 rounded-lg border border-border bg-muted/40 p-1"
        role="group"
        :aria-label="t('settings.theme.label')"
      >
        <Button
          v-for="choice in themeChoices"
          :key="choice.value"
          type="button"
          variant="ghost"
          class="flex h-auto min-h-0 min-w-0 flex-1 flex-col items-center gap-1 rounded-md px-1 py-2.5 text-muted-foreground hover:text-foreground"
          :aria-pressed="themePref === choice.value"
          :class="
            cn(
              themePref === choice.value &&
                'bg-background text-primary shadow-sm hover:bg-background hover:text-primary'
            )
          "
          @click="pickTheme(choice.value)"
        >
          <component :is="choice.icon" class="size-[1.125rem] shrink-0" aria-hidden="true" />
          <span class="text-center text-[10px] font-medium leading-tight">{{ t(choice.labelKey) }}</span>
        </Button>
      </div>
    </div>
  </div>
</template>
