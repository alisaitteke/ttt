<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Archive,
  ArchiveRestore,
  CheckSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-vue-next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import AdobeAppIcon from '@/components/AdobeAppIcon.vue';
import type { AdobeApp } from '@/components/AdobeAppIcon.vue';
import type { ChatSummary, DesignToolInfo } from '@/lib/api';

const props = defineProps<{
  chat: ChatSummary;
  designTools: DesignToolInfo[];
  activeChatId: string | null;
  isRenaming: boolean;
  renameDraft: string;
  /** When true, row is in the archived list (show Unarchive). */
  inArchivedList: boolean;
  selectMode: boolean;
  selected: boolean;
}>();

const emit = defineEmits<{
  select: [id: string];
  'enter-select-with': [id: string];
  'toggle-selected': [id: string];
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

function onRowClick(): void {
  if (props.selectMode) emit('toggle-selected', props.chat.id);
  else emit('select', props.chat.id);
}

function onCheckboxChange(): void {
  emit('toggle-selected', props.chat.id);
}

const { t } = useI18n();

const actionsAriaLabel = computed(() =>
  t('sidebar.chatActionsAria', { title: props.chat.title })
);

const checkboxAriaLabel = computed(() =>
  t('sidebar.selectCheckboxAria', { title: props.chat.title })
);

const stackedTools = computed(() => {
  const ids = props.chat.tools ?? [];
  return ids.slice(0, 3).map((id) => ({
    id,
    iconKey: (props.designTools.find((t) => t.id === id)?.iconKey ?? 'ps') as AdobeApp,
  }));
});
</script>

<template>
  <div
    class="group relative flex cursor-pointer items-center gap-2 rounded-md px-3.5 py-1 text-sm hover:bg-accent/40"
    :class="{
      'bg-accent/45': !selectMode && chat.id === activeChatId,
      'ring-1 ring-ring/40': selectMode && selected,
    }"
    @click="onRowClick"
  >
    <input
      v-if="selectMode"
      type="checkbox"
      class="size-4 shrink-0 rounded border border-input bg-background text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      :checked="selected"
      :aria-label="checkboxAriaLabel"
      @click.stop.prevent="onCheckboxChange"
    />
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
    </div>

    <DropdownMenu :modal="false">
      <DropdownMenuTrigger as-child>
        <button
          type="button"
          class="invisible flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background/50 group-hover:visible data-[state=open]:visible"
          :aria-label="actionsAriaLabel"
          @click.stop
        >
          <MoreHorizontal class="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        class="w-max max-w-[min(24rem,calc(100vw-2rem))]"
      >
        <DropdownMenuItem class="gap-2" @select="emit('start-rename')">
          <Pencil class="size-3.5 shrink-0" />
          {{ t('sidebar.menuRename') }}
        </DropdownMenuItem>
        <DropdownMenuItem class="gap-2" @select="emit('enter-select-with', chat.id)">
          <CheckSquare class="size-3.5 shrink-0" />
          {{ t('sidebar.menuSelect') }}
        </DropdownMenuItem>
        <DropdownMenuItem
          v-if="!inArchivedList"
          class="gap-2"
          @select="emit('archive', chat.id)"
        >
          <Archive class="size-3.5 shrink-0" />
          {{ t('sidebar.menuArchive') }}
        </DropdownMenuItem>
        <DropdownMenuItem v-else class="gap-2" @select="emit('unarchive', chat.id)">
          <ArchiveRestore class="size-3.5 shrink-0" />
          {{ t('sidebar.menuUnarchive') }}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          class="gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
          @select="emit('delete', chat.id)"
        >
          <Trash2 class="size-3.5 shrink-0" />
          {{ t('sidebar.menuDelete') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <div
      v-if="stackedTools.length > 0"
      class="flex shrink-0 -space-x-1.5"
      aria-hidden="true"
    >
      <div
        v-for="(item, index) in stackedTools"
        :key="item.id"
        class="relative inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted p-px ring-1 ring-background"
        :style="{ zIndex: index + 1 }"
      >
        <AdobeAppIcon :app="item.iconKey" :size="14" />
      </div>
    </div>
  </div>
</template>
