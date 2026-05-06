<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowUp, FolderOpen, Paperclip, Square } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import PathMessageModal from '@/components/PathMessageModal.vue';
import { ApiError, apiPickLocalFile, apiStageDroppedFile } from '@/lib/api';

const props = defineProps<{ busy: boolean; disabled?: boolean }>();

const { t } = useI18n();

const emit = defineEmits<{
  send: [prompt: string];
  abort: [];
}>();

interface PathModalPayload {
  title: string;
  body: string;
  primaryLabel?: string;
  onPrimary?: () => void;
}

const draft = ref('');
const textareaEl = ref<HTMLTextAreaElement | null>(null);
const picking = ref(false);
const pathModal = ref<PathModalPayload | null>(null);
const fileDragDepth = ref(0);
const dropping = ref(false);

const fileDragActive = computed(
  () => fileDragDepth.value > 0 && !props.busy && !props.disabled && !picking.value
);

function dismissPathModal(): void {
  pathModal.value = null;
}

function showPathModal(payload: PathModalPayload): void {
  pathModal.value = payload;
}

function onPathModalPrimary(): void {
  const cb = pathModal.value?.onPrimary;
  dismissPathModal();
  cb?.();
}

function isFileDrag(dt: DataTransfer | null): boolean {
  return Boolean(dt?.types?.includes('Files'));
}

function pathFromFileUriList(raw: string): string | null {
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (!trimmed.startsWith('file://')) continue;
    try {
      const url = new URL(trimmed);
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

function insertLocalPath(path: string, kind: 'file' | 'folder'): void {
  const prefix =
    kind === 'folder' ? t('composer.pathPrefixFolder') : t('composer.pathPrefixFile');
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

  dismissPathModal();

  const uri =
    dt.getData('text/uri-list') ||
    dt.getData('text/plain') ||
    dt.getData('application/x-moz-file-promise-url');
  const fromUri = pathFromFileUriList(uri);
  if (fromUri) {
    const kind =
      fromUri.endsWith('/') || /[/\\]$/.test(fromUri) ? 'folder' : 'file';
    const path =
      kind === 'folder' && fromUri.length > 1
        ? fromUri.replace(/[/\\]+$/, '')
        : fromUri;
    insertLocalPath(path, kind);
    return;
  }

  const items = dt.items;
  if (items?.length === 1) {
    const item = items[0];
    if (item.kind === 'file') {
      const entry =
        'webkitGetAsEntry' in item && typeof item.webkitGetAsEntry === 'function'
          ? item.webkitGetAsEntry()
          : null;
      if (entry && 'isDirectory' in entry && entry.isDirectory) {
        showPathModal({
          title: t('composer.folderDropTitle'),
          body: t('composer.folderDropBody'),
          primaryLabel: t('composer.folderDropPrimary'),
          onPrimary: () => {
            void runPickLocal('folder');
          },
        });
        return;
      }
    }
  }

  const files = dt.files;
  if (!files?.length) return;
  if (files.length > 1) {
    showPathModal({
      title: t('composer.multiFileDropTitle'),
      body: t('composer.multiFileDropBody'),
    });
    return;
  }

  const file = files[0];
  dropping.value = true;
  try {
    const { path } = await apiStageDroppedFile(file);
    insertLocalPath(path, 'file');
  } catch (err) {
    if (err instanceof ApiError && err.status === 413) {
      showPathModal({
        title: t('composer.fileTooLargeTitle'),
        body: t('composer.fileTooLargeBody'),
      });
    } else if (err instanceof ApiError) {
      showPathModal({
        title: t('composer.stageFailTitle'),
        body: err.message,
      });
    } else {
      showPathModal({
        title: t('composer.stageFailTitle'),
        body: t('composer.stageFailUnexpectedBody'),
      });
    }
  } finally {
    dropping.value = false;
  }
}

async function runPickLocal(kind: 'file' | 'folder'): Promise<void> {
  if (props.busy || props.disabled || picking.value) return;
  dismissPathModal();
  picking.value = true;
  try {
    const result = await apiPickLocalFile(kind);
    if ('path' in result && result.path) {
      insertLocalPath(result.path, kind);
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 501) {
      showPathModal({
        title: t('composer.pickerUnavailableTitle'),
        body: t('composer.pickerUnavailableBody'),
      });
    } else if (e instanceof ApiError) {
      showPathModal({
        title:
          kind === 'folder'
            ? t('composer.pickFolderFailTitle')
            : t('composer.pickFileFailTitle'),
        body: e.message,
      });
    } else {
      showPathModal({
        title:
          kind === 'folder'
            ? t('composer.pickFolderFailTitle')
            : t('composer.pickFileFailTitle'),
        body: t('composer.pickUnexpectedBody'),
      });
    }
  } finally {
    picking.value = false;
  }
}

async function onPickLocalPath(): Promise<void> {
  await runPickLocal('file');
}

async function onPickLocalFolder(): Promise<void> {
  await runPickLocal('folder');
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
        class="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-primary/70 bg-background/90 px-4 text-center backdrop-blur-[1px]"
      >
        <p class="text-sm font-medium text-foreground">
          {{
            dropping
              ? t('composer.dropCopyingOverlay')
              : t('composer.dropFileOverlay')
          }}
        </p>
        <p v-if="!dropping" class="max-w-sm text-xs text-muted-foreground">
          {{ t('composer.dropOverlayHint') }}
        </p>
      </div>
      <textarea
        ref="textareaEl"
        v-model="draft"
        :disabled="busy || disabled"
        :rows="2"
        :placeholder="t('composer.placeholder')"
        class="block w-full resize-none border-0 bg-transparent pb-1 pl-4 pr-14 pt-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60 max-h-48 min-h-[52px]"
        @keydown="handleKey"
      />
      <div class="absolute right-2 top-2 z-10 flex items-center">
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
      <div class="flex w-full flex-wrap items-center gap-2 px-2 pb-2">
        <div class="flex min-w-0 flex-shrink-0 flex-wrap items-center gap-2">
          <slot name="actions" />
        </div>
        <div class="ml-auto flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            :disabled="busy || disabled || picking"
            :title="t('composer.attachFileTitle')"
            class="size-8 shrink-0 text-muted-foreground"
            @click="onPickLocalPath"
          >
            <Paperclip class="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            :disabled="busy || disabled || picking"
            :title="t('composer.attachFolderTitle')"
            class="size-8 shrink-0 text-muted-foreground"
            @click="onPickLocalFolder"
          >
            <FolderOpen class="size-4" />
          </Button>
        </div>
      </div>
    </div>
    <PathMessageModal
      v-if="pathModal"
      :title="pathModal.title"
      :body="pathModal.body"
      :primary-label="pathModal.primaryLabel"
      @close="dismissPathModal"
      @primary="onPathModalPrimary"
    />
  </div>
</template>
