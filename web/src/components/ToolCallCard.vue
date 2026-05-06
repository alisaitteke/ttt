<script setup lang="ts">
import { computed, inject, reactive, ref, watch, type Ref } from 'vue';
import { TTT_REVEAL_PATH_PREFIX } from '@ttt/lib/tool-ui-conventions';
import { useI18n } from 'vue-i18n';
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, FolderOpen, Download } from 'lucide-vue-next';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ToolCall } from '@/stores/chat';
import { apiRevealFile, ApiError } from '@/lib/api';

const props = defineProps<{ toolCall: ToolCall }>();

const { t } = useI18n();

/** When non-null, user explicitly toggled; otherwise follow auto-expand rules. */
const manuallySetOpen = ref<boolean | null>(null);

/** Tool arguments section; collapsed by default to emphasize result/output. */
const inputOpen = ref(false);

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

const resultParsed = computed(() => {
  const raw = props.toolCall.result?.content ?? '';
  if (!raw) return { text: '', paths: [] as string[] };
  const lines = raw.split('\n');
  const paths: string[] = [];
  const kept: string[] = [];
  for (const line of lines) {
    if (line.startsWith(TTT_REVEAL_PATH_PREFIX)) {
      const p = line.slice(TTT_REVEAL_PATH_PREFIX.length).trim();
      if (p) paths.push(p);
    } else {
      kept.push(line);
    }
  }
  return { text: kept.join('\n'), paths };
});

/**
 * Expand by default when a tool succeeded and declared revealable paths (any MCP).
 * Keeps noisy tools (e.g. pings) collapsed unless the user opens them.
 */
const shouldAutoExpand = computed(
  () =>
    props.toolCall.status === 'success' &&
    Boolean(props.toolCall.result?.ok) &&
    resultParsed.value.paths.length > 0
);

const open = computed(() => {
  if (manuallySetOpen.value !== null) return manuallySetOpen.value;
  return shouldAutoExpand.value;
});

function toggleOpen() {
  const current =
    manuallySetOpen.value !== null ? manuallySetOpen.value : shouldAutoExpand.value;
  manuallySetOpen.value = !current;
}

function toggleInputOpen() {
  inputOpen.value = !inputOpen.value;
}

const toolInputSectionId = computed(() => `tool-input-${props.toolCall.id}`);

const revealLabel = computed(() => {
  const p = hostPlatform.value;
  if (p === 'darwin') return t('toolCall.revealDarwin');
  if (p === 'win32') return t('toolCall.revealWin32');
  return t('toolCall.revealFallback');
});

function toolCallStatusLabel(status: string): string {
  if (status === 'pending') return t('toolCall.statusPending');
  if (status === 'success') return t('toolCall.statusSuccess');
  if (status === 'error') return t('toolCall.statusError');
  return status;
}

const revealError = ref<string | null>(null);
const revealingPath = ref<string | null>(null);

const PREVIEW_IMAGE_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
]);

/** Per-path image load errors; cleared when this tool result updates. */
const previewErrorByPath = reactive<Record<string, boolean>>({});

watch(
  () => [props.toolCall.id, props.toolCall.result?.content ?? ''] as const,
  () => {
    for (const k of Object.keys(previewErrorByPath)) {
      delete previewErrorByPath[k];
    }
  }
);

function isPreviewableImagePath(filePath: string): boolean {
  const seg = filePath.split(/[/\\]/).pop() ?? '';
  const dot = seg.lastIndexOf('.');
  if (dot < 0) return false;
  return PREVIEW_IMAGE_EXTS.has(seg.slice(dot).toLowerCase());
}

function previewImageUrl(filePath: string): string {
  return `/api/files/preview?path=${encodeURIComponent(filePath)}`;
}

function onPreviewError(pathKey: string) {
  previewErrorByPath[pathKey] = true;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function downloadExportPath(filePath: string) {
  revealError.value = null;
  try {
    const url = `/api/files/download?path=${encodeURIComponent(filePath)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      revealError.value = data.error ?? res.statusText;
      return;
    }
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filePath.split(/[/\\]/).pop() ?? 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
  } catch (e) {
    revealError.value = e instanceof Error ? e.message : String(e);
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
      @click="toggleOpen"
    >
      <component :is="open ? ChevronDown : ChevronRight" class="size-3 text-muted-foreground" />
      <span class="font-mono text-foreground">{{ displayName }}</span>
      <span class="ml-auto flex items-center gap-1.5">
        <Loader2 v-if="toolCall.status === 'pending'" class="size-3 animate-spin text-muted-foreground" />
        <CheckCircle2 v-else-if="toolCall.status === 'success'" class="size-3.5 text-emerald-500" />
        <XCircle v-else class="size-3.5 text-destructive" />
        <Badge
          v-if="toolCall.status !== 'pending'"
          :variant="toolCall.status === 'success' ? 'success' : 'destructive'"
          class="text-[10px]"
        >
          {{ toolCallStatusLabel(toolCall.status) }}
        </Badge>
      </span>
    </button>
    <div v-if="open" class="space-y-2 border-t border-border p-3 text-xs">
      <div v-if="toolCall.result">
        <div class="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {{ t('toolCall.result') }}
        </div>
        <div
          v-if="resultParsed.paths.length > 0"
          class="mb-2 space-y-2 rounded-md border border-border bg-muted/30 p-2"
        >
          <div
            v-for="p in resultParsed.paths"
            :key="p"
            class="space-y-2"
          >
            <div class="flex flex-wrap items-center gap-2">
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
            <div
              v-if="
                toolCall.status === 'success' &&
                toolCall.result?.ok &&
                isPreviewableImagePath(p)
              "
              class="pl-0.5"
            >
              <DropdownMenu v-if="!previewErrorByPath[p]" :modal="false">
                <DropdownMenuTrigger as-child>
                  <button
                    type="button"
                    class="block max-w-full rounded-md border border-border bg-muted/20 p-0 outline-none ring-offset-background hover:opacity-95 focus-visible:ring-2 focus-visible:ring-ring"
                    :aria-label="t('toolCall.previewMenuAria')"
                  >
                    <img
                      :src="previewImageUrl(p)"
                      :alt="t('toolCall.previewAlt')"
                      class="max-h-36 max-w-full rounded-md object-contain shadow-sm pointer-events-none"
                      loading="lazy"
                      decoding="async"
                      @error="onPreviewError(p)"
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" class="min-w-[11rem]">
                  <DropdownMenuItem class="gap-2 text-xs" @select="() => downloadExportPath(p)">
                    <Download class="size-3.5 shrink-0" />
                    {{ t('toolCall.previewMenuDownload') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem class="gap-2 text-xs" @select="() => revealPath(p)">
                    <FolderOpen class="size-3.5 shrink-0" />
                    {{ revealLabel }}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <p
                v-else
                class="text-[10px] text-muted-foreground"
              >
                {{ t('toolCall.previewUnavailable') }}
              </p>
            </div>
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
      <div>
        <button
          type="button"
          class="flex w-full items-center gap-1.5 rounded-md py-1 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted/50"
          :aria-expanded="inputOpen"
          :aria-controls="toolInputSectionId"
          @click="toggleInputOpen"
        >
          <component
            :is="inputOpen ? ChevronDown : ChevronRight"
            class="size-3 shrink-0 text-muted-foreground"
          />
          <span>{{ t('toolCall.input') }}</span>
          <span class="sr-only"> — {{ t('toolCall.inputToggleAria') }}</span>
        </button>
        <div v-show="inputOpen" :id="toolInputSectionId">
          <pre class="mt-2 overflow-x-auto rounded-md bg-muted/40 p-2 text-[11px] leading-snug">{{ formattedInput }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
