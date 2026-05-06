<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { Moon, Sun } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import {
  applyThemeClass,
  isFollowingSystemTheme,
  setStoredTheme,
} from '@/lib/theme';

const isDark = ref(
  typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark')
);

function syncFromDom(): void {
  isDark.value = document.documentElement.classList.contains('dark');
}

function toggle(): void {
  const next = !isDark.value;
  setStoredTheme(next);
  syncFromDom();
}

onMounted(() => {
  applyThemeClass();
  syncFromDom();
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onSchemeChange = (): void => {
    if (isFollowingSystemTheme()) {
      applyThemeClass();
      syncFromDom();
    }
  };
  mq.addEventListener('change', onSchemeChange);
  onUnmounted(() => mq.removeEventListener('change', onSchemeChange));
});
</script>

<template>
  <Button
    variant="ghost"
    size="icon"
    type="button"
    class="shrink-0"
    :aria-pressed="isDark"
    :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="toggle"
  >
    <Sun v-if="isDark" class="size-4" />
    <Moon v-else class="size-4" />
  </Button>
</template>
