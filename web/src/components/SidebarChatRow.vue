<script setup lang="ts">
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from 'lucide-vue-next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ChatSummary } from '@/lib/api';

const props = defineProps<{
  chat: ChatSummary;
  activeChatId: string | null;
  isRenaming: boolean;
  renameDraft: string;
  /** When true, row is in the archived list (show Unarchive). */
  inArchivedList: boolean;
  formatDate: (ts: number) => string;
}>();

const emit = defineEmits<{
  select: [id: string];
  'update:renameDraft': [v: string];
  'start-rename': [];
  rename: [id: string, title: string];
  'cancel-rename': [];
  delete: [id: string];
  archive: [id: string];
  unarchive: [id: string];
}>();

function commitRename(id: string) {
  const title = props.renameDraft.trim();
  if (title) emit('rename', id, title);
  emit('cancel-rename');
}

function cancelRename() {
  emit('cancel-rename');
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

    <DropdownMenu :modal="false">
      <DropdownMenuTrigger as-child>
        <button
          type="button"
          class="invisible flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background/50 group-hover:visible data-[state=open]:visible"
          :aria-label="`Chat actions: ${chat.title}`"
          @click.stop
        >
          <MoreHorizontal class="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" class="w-36 min-w-0">
        <DropdownMenuItem class="gap-2" @select="emit('start-rename')">
          <Pencil class="size-3.5" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          v-if="!inArchivedList"
          class="gap-2"
          @select="emit('archive', chat.id)"
        >
          <Archive class="size-3.5" />
          Archive
        </DropdownMenuItem>
        <DropdownMenuItem v-else class="gap-2" @select="emit('unarchive', chat.id)">
          <ArchiveRestore class="size-3.5" />
          Unarchive
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          class="gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
          @select="emit('delete', chat.id)"
        >
          <Trash2 class="size-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
