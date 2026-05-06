<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
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

const themeChoices: { value: ThemePreference; labelKey: string }[] = [
  { value: 'system', labelKey: 'settings.theme.system' },
  { value: 'light', labelKey: 'settings.theme.light' },
  { value: 'dark', labelKey: 'settings.theme.dark' },
];
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <Label class="text-muted-foreground">{{ t('locale.switchLabel') }}</Label>
      <LocaleSwitcher />
    </div>

    <div class="space-y-2">
      <Label class="text-muted-foreground">{{ t('settings.theme.label') }}</Label>
      <div class="flex flex-wrap gap-2">
        <Button
          v-for="choice in themeChoices"
          :key="choice.value"
          type="button"
          variant="outline"
          size="sm"
          class="min-w-[5.5rem]"
          :aria-pressed="themePref === choice.value"
          :class="
            cn(
              themePref === choice.value &&
                'border-primary bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
            )
          "
          @click="pickTheme(choice.value)"
        >
          {{ t(choice.labelKey) }}
        </Button>
      </div>
    </div>
  </div>
</template>
