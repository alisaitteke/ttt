<script setup lang="ts">
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from 'lucide-vue-next';
import type { ChatSummary } from '@/lib/api';

const props = defineProps<{
  chat: ChatSummary;
  activeChatId: string | null;
  menuOpen: boolean;
  isRenaming: boolean;
  renameDraft: string;
  /** When true, row is in the archived list (show Unarchive). */
  inArchivedList: boolean;
  formatDate: (ts: number) => string;
}>();

const emit = defineEmits<{
  select: [id: string];
  'toggle-menu': [];
  'update:renameDraft': [v: string];
  'start-rename': [];
  rename: [id: string, title: string];
  'cancel-rename': [];
  delete: [id: string];
  archive: [id: string];
  unarchive: [id: string];
}>();

function toggleMenu(event: Event): void {
  event.stopPropagation();
  emit('toggle-menu');
}

function startRename(event: Event): void {
  event.stopPropagation();
  emit('start-rename');
}

function commitRename(id: string) {
  const title = props.renameDraft.trim();
  if (title) emit('rename', id, title);
  emit('cancel-rename');
}

function cancelRename() {
  emit('cancel-rename');
}

function onDelete(id: string, event: Event) {
  event.stopPropagation();
  emit('delete', id);
}

function onArchive(id: string, event: Event) {
  event.stopPropagation();
  emit('archive', id);
}

function onUnarchive(id: string, event: Event) {
  event.stopPropagation();
  emit('unarchive', id);
}
</script>

<template>
  <div
    class="group relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40"
    :class="{ 'bg-accent/45': chat.id === activeChatId }"
    @click="emit('select', chat.id)"
  >
    <div class="min-w-0 flex-1">
      <input
        v-if="isRenaming"
        :value="renameDraft"
        class="w-full rounded border border-input bg-background px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        autofocus
        @click.stop
        @input="emit('update:renameDraft', ($event.target as HTMLInputElement).value)"
        @blur="commitRename(chat.id)"
        @keydown.enter.prevent="commitRename(chat.id)"
        @keydown.escape.prevent="cancelRename"
      />
      <div v-else class="truncate" :title="chat.title">{{ chat.title }}</div>
      <div class="text-[10px] text-muted-foreground">
        {{ formatDate(chat.updatedAt) }} · {{ chat.provider }}
      </div>
    </div>

    <button
      class="invisible flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-background/50 group-hover:visible"
      :class="{ visible: menuOpen }"
      @click="toggleMenu($event)"
    >
      <MoreHorizontal class="size-3.5" />
    </button>

    <div
      v-if="menuOpen"
      class="absolute right-1 top-9 z-10 w-36 rounded-md border border-border bg-popover p-1 text-sm shadow-md"
      @click.stop
    >
      <button
        class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent"
        @click="startRename($event)"
      >
        <Pencil class="size-3.5" />
        Rename
      </button>
      <button
        v-if="!inArchivedList"
        class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent"
        @click="onArchive(chat.id, $event)"
      >
        <Archive class="size-3.5" />
        Archive
      </button>
      <button
        v-else
        class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent"
        @click="onUnarchive(chat.id, $event)"
      >
        <ArchiveRestore class="size-3.5" />
        Unarchive
      </button>
      <button
        class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-destructive hover:bg-destructive/10"
        @click="onDelete(chat.id, $event)"
      >
        <Trash2 class="size-3.5" />
        Delete
      </button>
    </div>
  </div>
</template>
