<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Menu, MessageSquarePlus } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ChatSummary } from '@/lib/api';
import type { ChatTotals } from '@/stores/chat';

const props = defineProps<{
  chat: ChatSummary | null;
  totals: ChatTotals | null;
  sidebarMobileOpen: boolean;
}>();

const emit = defineEmits<{
  'open-sidebar': [];
  'new-chat': [];
}>();

const { locale, t } = useI18n();

const tokenFormatter = computed(
  () => new Intl.NumberFormat(locale.value as string)
);

function formatUsd(value: number): string {
  if (value <= 0) return '$0.0000';
  if (value < 0.0001) return t('status.priceLessThanMicro');
  return new Intl.NumberFormat(locale.value as string, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatTokens(value: number): string {
  return tokenFormatter.value.format(value);
}

const hasData = computed(() => {
  const sums = props.totals;
  return Boolean(sums && sums.assistantTurns > 0);
});

const hasUnpricedTurn = computed(() => {
  const sums = props.totals;
  return Boolean(sums && sums.assistantTurns > 0 && sums.pricedTurns < sums.assistantTurns);
});

const costLabel = computed(() => {
  const sums = props.totals;
  if (!sums || sums.assistantTurns === 0) return null;
  if (sums.pricedTurns === 0) return null;
  return formatUsd(sums.totalUsd);
});
</script>

<template>
  <header
    class="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/50 bg-background/20 px-4 backdrop-blur-2xl backdrop-saturate-150 dark:bg-background/[0.14]"
  >
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="size-9 shrink-0 md:hidden"
      :aria-label="t('status.openNavAria')"
      :aria-expanded="sidebarMobileOpen"
      @click="emit('open-sidebar')"
    >
      <Menu class="size-5" />
    </Button>

    <div class="min-w-0 flex-1 truncate text-sm font-medium">
      {{ chat?.title ?? t('status.fallbackChatTitle') }}
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <TooltipProvider v-if="chat && hasData">
        <Tooltip>
          <TooltipTrigger
            class="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium tabular-nums text-muted-foreground hover:bg-muted"
          >
            {{ costLabel ?? t('status.costDash') }}
          </TooltipTrigger>
          <TooltipContent align="end" class="w-64">
            <div class="space-y-2">
              <div class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {{ t('status.usageHeading') }}
              </div>

              <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <span class="text-muted-foreground">{{ t('status.input') }}</span>
                <span class="text-end tabular-nums">
                  {{ formatTokens(totals!.inputTokens) }}
                  {{ t('status.tokensUnit') }} · {{ formatUsd(totals!.inputUsd) }}
                </span>

                <template v-if="totals!.cachedReadTokens > 0">
                  <span class="text-muted-foreground">{{ t('status.cachedRead') }}</span>
                  <span class="text-end tabular-nums">
                    {{ formatTokens(totals!.cachedReadTokens) }}
                    {{ t('status.tokensUnit') }} · {{ formatUsd(totals!.cachedReadUsd) }}
                  </span>
                </template>

                <template v-if="totals!.cachedWriteTokens > 0">
                  <span class="text-muted-foreground">{{ t('status.cachedWrite') }}</span>
                  <span class="text-end tabular-nums">
                    {{ formatTokens(totals!.cachedWriteTokens) }}
                    {{ t('status.tokensUnit') }} · {{ formatUsd(totals!.cachedWriteUsd) }}
                  </span>
                </template>

                <span class="text-muted-foreground">{{ t('status.output') }}</span>
                <span class="text-end tabular-nums">
                  {{ formatTokens(totals!.outputTokens) }}
                  {{ t('status.tokensUnit') }} · {{ formatUsd(totals!.outputUsd) }}
                </span>

                <template v-if="totals!.reasoningTokens > 0">
                  <span class="text-muted-foreground">{{ t('status.reasoning') }}</span>
                  <span class="text-end tabular-nums">
                    {{ formatTokens(totals!.reasoningTokens) }} {{ t('status.tokensUnit') }}
                  </span>
                </template>
              </div>

              <div class="border-t border-border pt-2 text-xs">
                <div class="flex items-center justify-between font-medium">
                  <span>{{ t('status.total') }}</span>
                  <span class="tabular-nums">
                    {{ formatTokens(totals!.totalTokens) }}
                    {{ t('status.tokensUnit') }} · {{ formatUsd(totals!.totalUsd) }}
                  </span>
                </div>
              </div>

              <p
                v-if="hasUnpricedTurn"
                class="text-[11px] leading-snug text-muted-foreground"
              >
                {{ t('status.unpricedHint') }}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-9 shrink-0 gap-2 px-3"
        :aria-label="t('status.newChatAria')"
        @click="emit('new-chat')"
      >
        <MessageSquarePlus class="size-4 shrink-0" />
        <span class="hidden sm:inline">{{ t('status.newChatLabel') }}</span>
      </Button>
    </div>
  </header>
</template>
