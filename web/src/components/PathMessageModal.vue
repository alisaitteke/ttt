<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { X } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';

defineProps<{
  title: string;
  body: string;
  primaryLabel?: string;
}>();

const emit = defineEmits<{
  close: [];
  primary: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-background/70 p-4 backdrop-blur"
    role="dialog"
    aria-modal="true"
    aria-labelledby="path-message-modal-title"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg"
      @click.stop
    >
      <div class="mb-3 flex items-start justify-between gap-3">
        <h2 id="path-message-modal-title" class="text-base font-semibold text-foreground">
          {{ title }}
        </h2>
        <Button variant="ghost" size="icon" class="shrink-0" @click="emit('close')">
          <X class="size-4" />
        </Button>
      </div>
      <p class="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{{ body }}</p>
      <div class="mt-6 flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
        <Button variant="secondary" @click="emit('close')">{{
          t('pathModal.close')
        }}</Button>
        <Button v-if="primaryLabel" @click="emit('primary')">{{ primaryLabel }}</Button>
      </div>
    </div>
  </div>
</template>
