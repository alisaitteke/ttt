<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const repoUrl = 'https://github.com/alisaitteke/ttt';
const authorUrl = 'https://github.com/alisaitteke';

const { t } = useI18n();
</script>

<template>
  <footer
    class="flex h-9 shrink-0 items-center justify-center gap-2 border-t border-border/60 bg-background/80 px-4 text-[11px] text-muted-foreground backdrop-blur"
  >
    <a
      :href="repoUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="transition-colors hover:text-foreground"
    >
      {{ t('footer.github') }}
    </a>
    <span aria-hidden="true" class="text-muted-foreground/60">·</span>
    <a
      :href="authorUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="transition-colors hover:text-foreground"
    >
      @{{ t('footer.authorHandle') }}
    </a>
  </footer>
</template>
