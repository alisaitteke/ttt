<script setup lang="ts">
import { computed, inject, ref, type Ref } from 'vue';
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, FolderOpen } from 'lucide-vue-next';
import { Badge } from '@/components/ui/badge';
import type { ToolCall } from '@/stores/chat';
import { apiRevealFile, ApiError } from '@/lib/api';

const props = defineProps<{ toolCall: ToolCall }>();

const open = ref(false);

const hostPlatform = inject<Ref<string>>(
  'hostPlatform',
  ref('linux')
);

const displayName = computed(() => {
  const name = props.toolCall.name;
  const m = /^mcp__[a-z0-9_-]+__(.+)$/i.exec(name);
  return m ? m[1] : name;
});

const formattedInput = computed(() => safeJson(props.toolCall.input));

const TTT_REVEAL_PREFIX = 'TTT_REVEAL_PATH:';

const resultParsed = computed(() => {
  const raw = props.toolCall.result?.content ?? '';
  if (!raw) return { text: '', paths: [] as string[] };
  const lines = raw.split('\n');
  const paths: string[] = [];
  const kept: string[] = [];
  for (const line of lines) {
    if (line.startsWith(TTT_REVEAL_PREFIX)) {
      const p = line.slice(TTT_REVEAL_PREFIX.length).trim();
      if (p) paths.push(p);
    } else {
      kept.push(line);
    }
  }
  return { text: kept.join('\n'), paths };
});

const revealLabel = computed(() => {
  const p = hostPlatform.value;
  if (p === 'darwin') return 'Show in Finder';
  if (p === 'win32') return 'Show in File Explorer';
  return 'Reveal in file manager';
});

const revealError = ref<string | null>(null);
const revealingPath = ref<string | null>(null);

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function revealPath(path: string) {
  revealError.value = null;
  revealingPath.value = path;
  try {
    await apiRevealFile(path);
  } catch (e) {
    if (e instanceof ApiError) {
      revealError.value = e.message;
    } else {
      revealError.value = e instanceof Error ? e.message : String(e);
    }
  } finally {
    revealingPath.value = null;
  }
}
</script>

<template>
  <div class="rounded-lg border border-border bg-card/50">
    <button
      type="button"
      class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
      @click="open = !open"
    >
      <component :is="open ? ChevronDown : ChevronRight" class="size-3 text-muted-foreground" />
      <span class="font-mono text-foreground">{{ displayName }}</span>
      <span class="ml-auto flex items-center gap-1.5">
        <Loader2 v-if="toolCall.status === 'pending'" class="size-3 animate-spin text-muted-foreground" />
        <CheckCircle2 v-else-if="toolCall.status === 'success'" class="size-3.5 text-emerald-500" />
        <XCircle v-else class="size-3.5 text-destructive" />
        <Badge v-if="toolCall.status !== 'pending'" :variant="toolCall.status === 'success' ? 'success' : 'destructive'" class="text-[10px]">
          {{ toolCall.status }}
        </Badge>
      </span>
    </button>
    <div v-if="open" class="space-y-2 border-t border-border p-3 text-xs">
      <div>
        <div class="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Input
        </div>
        <pre class="overflow-x-auto rounded-md bg-muted/40 p-2 text-[11px] leading-snug">{{ formattedInput }}</pre>
      </div>
      <div v-if="toolCall.result">
        <div class="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Result
        </div>
        <div
          v-if="resultParsed.paths.length > 0"
          class="mb-2 space-y-2 rounded-md border border-border bg-muted/30 p-2"
        >
          <div
            v-for="p in resultParsed.paths"
            :key="p"
            class="flex flex-wrap items-center gap-2"
          >
            <code class="min-w-0 flex-1 break-all text-[11px] text-foreground">{{ p }}</code>
            <button
              type="button"
              class="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium text-foreground hover:bg-muted/80 disabled:opacity-50"
              :disabled="revealingPath === p"
              @click="revealPath(p)"
            >
              <FolderOpen class="size-3" />
              {{ revealLabel }}
            </button>
          </div>
          <p v-if="revealError" class="text-[11px] text-destructive">
            {{ revealError }}
          </p>
        </div>
        <pre
          v-if="resultParsed.text.trim()"
          class="max-h-64 overflow-auto rounded-md bg-muted/40 p-2 text-[11px] leading-snug"
        >{{ resultParsed.text }}</pre>
        <pre
          v-else-if="resultParsed.paths.length === 0"
          class="max-h-64 overflow-auto rounded-md bg-muted/40 p-2 text-[11px] leading-snug"
        >{{ toolCall.result.content }}</pre>
      </div>
    </div>
  </div>
</template>
