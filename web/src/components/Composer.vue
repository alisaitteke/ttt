<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { ArrowUp, Paperclip, Square } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { ApiError, apiPickLocalFile, apiStageDroppedFile } from '@/lib/api';

const props = defineProps<{ busy: boolean; disabled?: boolean }>();
const emit = defineEmits<{
  send: [prompt: string];
  abort: [];
}>();

const draft = ref('');
const textareaEl = ref<HTMLTextAreaElement | null>(null);
const picking = ref(false);
const pickError = ref<string | null>(null);
const fileDragDepth = ref(0);
const dropping = ref(false);

const fileDragActive = computed(
  () => fileDragDepth.value > 0 && !props.busy && !props.disabled && !picking.value
);

function isFileDrag(dt: DataTransfer | null): boolean {
  return Boolean(dt?.types?.includes('Files'));
}

function pathFromFileUriList(raw: string): string | null {
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (!t.startsWith('file://')) continue;
    try {
      const url = new URL(t);
      if (url.protocol !== 'file:') continue;
      let pathname = decodeURIComponent(url.pathname.replace(/\+/g, ' '));
      if (/^\/[a-zA-Z]:\//.test(pathname)) {
        pathname = pathname.slice(1);
      }
      return pathname;
    } catch {
      continue;
    }
  }
  return null;
}

function handleKey(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    submit();
  }
}

function insertLocalFilePath(path: string): void {
  const prefix = 'Local file path: ';
  const chunk = `${prefix}${path}\n`;
  const el = textareaEl.value;
  if (!el) {
    draft.value += (draft.value && !draft.value.endsWith('\n') ? '\n\n' : '') + chunk;
    return;
  }
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const before = draft.value.slice(0, start);
  const after = draft.value.slice(end);
  const lead = before.length > 0 && !before.endsWith('\n') ? '\n\n' : '';
  draft.value = before + lead + chunk + after;
  void nextTick(() => {
    const pos = start + lead.length + chunk.length;
    el.focus();
    el.selectionStart = pos;
    el.selectionEnd = pos;
  });
}

function onDragEnter(e: DragEvent): void {
  if (props.busy || props.disabled || picking.value) return;
  if (!isFileDrag(e.dataTransfer)) return;
  e.preventDefault();
  fileDragDepth.value++;
}

function onDragLeave(e: DragEvent): void {
  if (!isFileDrag(e.dataTransfer)) return;
  const cur = e.currentTarget as HTMLElement;
  const rel = e.relatedTarget as Node | null;
  if (rel && cur.contains(rel)) return;
  e.preventDefault();
  fileDragDepth.value = Math.max(0, fileDragDepth.value - 1);
}

function onDragOver(e: DragEvent): void {
  if (props.busy || props.disabled || picking.value) return;
  if (!isFileDrag(e.dataTransfer)) return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'copy';
}

async function onDrop(e: DragEvent): Promise<void> {
  if (props.busy || props.disabled || picking.value) return;
  if (!isFileDrag(e.dataTransfer)) return;
  e.preventDefault();
  fileDragDepth.value = 0;

  const dt = e.dataTransfer;
  if (!dt) return;

  pickError.value = null;

  const uri =
    dt.getData('text/uri-list') ||
    dt.getData('text/plain') ||
    dt.getData('application/x-moz-file-promise-url');
  const fromUri = pathFromFileUriList(uri);
  if (fromUri) {
    insertLocalFilePath(fromUri);
    return;
  }

  const files = dt.files;
  if (!files?.length) return;
  if (files.length > 1) {
    pickError.value = 'Drop one file at a time.';
    return;
  }

  const file = files[0];
  dropping.value = true;
  try {
    const { path } = await apiStageDroppedFile(file);
    insertLocalFilePath(path);
  } catch (err) {
    if (err instanceof ApiError && err.status === 413) {
      pickError.value = 'File is too large to stage (max 2 GB).';
    } else if (err instanceof ApiError) {
      pickError.value = err.message;
    } else {
      pickError.value = 'Could not stage the dropped file.';
    }
  } finally {
    dropping.value = false;
  }
}

async function onPickLocalPath(): Promise<void> {
  if (props.busy || props.disabled || picking.value) return;
  pickError.value = null;
  picking.value = true;
  try {
    const result = await apiPickLocalFile();
    if ('path' in result && result.path) {
      insertLocalFilePath(result.path);
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 501) {
      pickError.value = 'Local file picker is not supported on this platform.';
    } else if (e instanceof ApiError) {
      pickError.value = e.message;
    } else {
      pickError.value = 'Could not pick a file.';
    }
  } finally {
    picking.value = false;
  }
}

function submit(): void {
  const text = draft.value.trim();
  if (!text || props.busy || props.disabled) return;
  emit('send', text);
  draft.value = '';
}
</script>

<template>
  <div class="border-t border-border bg-background px-4 py-3">
    <div
      class="relative mx-auto max-w-3xl rounded-2xl border border-border bg-card shadow-sm transition-shadow focus-within:ring-1 focus-within:ring-ring"
      @dragenter="onDragEnter"
      @dragleave="onDragLeave"
      @dragover="onDragOver"
      @drop="onDrop"
    >
      <div
        v-if="fileDragActive || dropping"
        class="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-primary/70 bg-background/90 px-4 text-center backdrop-blur-[1px]"
      >
        <p class="text-sm font-medium text-foreground">
          {{ dropping ? 'Copying to ~/.ttt/drops on this computer…' : 'Drop file to add its path' }}
        </p>
        <p v-if="!dropping" class="max-w-sm text-xs text-muted-foreground">
          If the browser hides the real path, the file is copied once to a local staging folder
          (still on your machine, not sent over the internet).
        </p>
      </div>
      <textarea
        ref="textareaEl"
        v-model="draft"
        :disabled="busy || disabled"
        :rows="2"
        placeholder="Describe what you want the agent to do in your design tools…"
        class="block w-full resize-none border-0 bg-transparent px-4 pt-3 pb-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60 max-h-48 min-h-[52px]"
        @keydown="handleKey"
      />
      <div class="flex flex-wrap items-center gap-2 px-2 pb-2">
        <div class="flex min-w-0 flex-shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            :disabled="busy || disabled || picking"
            :title="
              'Insert local file path (opens a picker on this computer; the file is not uploaded)'
            "
            class="size-8 shrink-0 text-muted-foreground"
            @click="onPickLocalPath"
          >
            <Paperclip class="size-4" />
          </Button>
          <slot name="actions" />
        </div>
        <p
          v-if="pickError"
          class="w-full text-xs text-destructive sm:order-2 sm:w-auto sm:flex-1"
        >
          {{ pickError }}
        </p>
        <span
          class="min-w-0 flex-1 text-right text-[11px] leading-snug text-muted-foreground opacity-60 select-none sm:text-xs"
        >
          Press Enter to send · Shift+Enter for newline
        </span>
        <Button
          v-if="!busy"
          size="icon"
          :disabled="!draft.trim() || disabled"
          class="size-8 shrink-0 rounded-full disabled:opacity-40"
          @click="submit"
        >
          <ArrowUp class="size-4" />
        </Button>
        <Button
          v-else
          size="icon"
          variant="secondary"
          class="size-8 shrink-0 rounded-full"
          @click="emit('abort')"
        >
          <Square class="size-3.5" />
        </Button>
      </div>
    </div>
  </div>
</template>
