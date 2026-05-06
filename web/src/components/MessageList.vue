<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { User, Sparkles } from 'lucide-vue-next';
import MarkdownRender from 'vue-renderer-markdown';
import ToolCallCard from './ToolCallCard.vue';
import ProviderIcon from './ProviderIcon.vue';
import type { ChatMessage } from '@/stores/chat';
import type { ProviderInfo } from '@/lib/api';

const props = defineProps<{
  messages: ChatMessage[];
  busy: boolean;
  providers: ProviderInfo[];
  /** Extra bottom padding so scroll content clears the overlapped composer dock. */
  overlapComposerDock?: boolean;
}>();

const { t } = useI18n();

const scroller = ref<HTMLElement | null>(null);

async function scrollToBottom(): Promise<void> {
  await nextTick();
  if (scroller.value) {
    scroller.value.scrollTop = scroller.value.scrollHeight;
  }
}

watch(
  () => [props.messages.length, props.busy, props.messages[props.messages.length - 1]?.text],
  () => {
    void scrollToBottom();
  },
  { deep: true }
);

onMounted(scrollToBottom);

function assistantLabel(m: ChatMessage): string {
  if (!m.provider) return t('messages.assistantFallback');
  const provider = props.providers.find((p) => p.id === m.provider);
  const providerLabel = provider?.label ?? m.provider;
  const modelLabel = provider?.models.find((mm) => mm.id === m.model)?.label ?? m.model;
  return modelLabel
    ? `${providerLabel}${t('messages.assistantModelSep')}${modelLabel}`
    : providerLabel;
}
</script>

<template>
  <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto">
    <div
      class="mx-auto flex max-w-3xl flex-col gap-6 px-4 pt-6"
      :class="props.overlapComposerDock ? 'pb-44 md:pb-52' : 'pb-6'"
    >
      <div
        v-if="messages.length === 0"
        class="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center"
      >
        <Sparkles class="mx-auto mb-3 size-6 text-muted-foreground" />
        <h2 class="text-base font-semibold">{{ t('messages.emptyHeading') }}</h2>
        <p class="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {{ t('messages.emptyHint') }}
        </p>
      </div>

      <div
        v-for="m in messages"
        :key="m.id"
        class="flex gap-3"
        :class="
          m.role === 'user'
            ? 'rounded-xl border border-primary/25 bg-primary/[0.07] p-3 shadow-sm dark:border-primary/35 dark:bg-primary/[0.11]'
            : ''
        "
      >
        <div
          class="flex size-7 shrink-0 items-center justify-center rounded-md border"
          :class="
            m.role === 'user'
              ? 'border-primary/35 bg-primary/15 text-primary'
              : 'border-border bg-card text-muted-foreground'
          "
        >
          <User v-if="m.role === 'user'" class="size-4" />
          <ProviderIcon v-else-if="m.provider" :provider="m.provider" :size="16" />
          <Sparkles v-else class="size-4" />
        </div>
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <div
            class="text-xs font-medium"
            :class="m.role === 'user' ? 'font-semibold text-primary' : 'text-muted-foreground'"
          >
            {{ m.role === 'user' ? t('messages.you') : assistantLabel(m) }}
          </div>
          <MarkdownRender
            v-if="m.text && m.role === 'assistant'"
            class="assistant-markdown min-w-0 text-sm leading-relaxed text-foreground"
            :content="m.text"
          />
          <div
            v-else-if="m.text"
            class="whitespace-pre-wrap text-sm font-medium leading-relaxed text-foreground"
          >{{ m.text }}</div>
          <ToolCallCard v-for="tc in m.toolCalls" :key="tc.id" :tool-call="tc" />
        </div>
      </div>

      <div v-if="busy" class="flex items-center gap-2 text-xs text-muted-foreground">
        <span class="inline-block size-1.5 animate-pulse rounded-full bg-muted-foreground" />
        {{ t('messages.busy') }}
      </div>
    </div>
  </div>
</template>
