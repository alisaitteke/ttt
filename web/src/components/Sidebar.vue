<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ChevronDown, ChevronRight, Plus, Settings2, Archive, Trash2, X } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import SidebarChatRow from '@/components/SidebarChatRow.vue';
import type { ChatSummary, DesignToolInfo } from '@/lib/api';

const props = defineProps<{
  chats: ChatSummary[];
  designTools: DesignToolInfo[];
  activeChatId: string | null;
  mobileOpen: boolean;
  selectMode: boolean;
  selectedChatIds: string[];
}>();

const emit = defineEmits<{
  'new-chat': [];
  select: [id: string];
  rename: [id: string, title: string];
  delete: [id: string];
  archive: [id: string];
  unarchive: [id: string];
  'update:mobileOpen': [open: boolean];
  'open-settings': [];
  'exit-select': [];
  'enter-select-with': [id: string];
  'toggle-selected': [id: string];
  'bulk-archive': [];
  'bulk-delete': [];
}>();

const { t } = useI18n();

const SIDEBAR_WIDTH_STORAGE_KEY = 'ttt-sidebar-width-pixels';
const SIDEBAR_WIDTH_DEFAULT = 260;
const SIDEBAR_WIDTH_MIN = 200;
const SIDEBAR_WIDTH_MAX = 520;

function clampSidebarWidth(n: number): number {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(n)));
}

function readStoredSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (raw === null) return SIDEBAR_WIDTH_DEFAULT;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return SIDEBAR_WIDTH_DEFAULT;
    return clampSidebarWidth(parsed);
  } catch {
    return SIDEBAR_WIDTH_DEFAULT;
  }
}

const sidebarWidthPx = ref(readStoredSidebarWidth());

function persistSidebarWidth(): void {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidthPx.value));
  } catch {
    /* ignore quota / private mode */
  }
}

let resizePointerStartX = 0;
let resizeWidthStart = SIDEBAR_WIDTH_DEFAULT;
let resizeListenersAttached = false;

function isRtlShell(): boolean {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('dir') === 'rtl';
}

function applySidebarResizeDelta(clientX: number): void {
  const delta = isRtlShell()
    ? resizePointerStartX - clientX
    : clientX - resizePointerStartX;
  sidebarWidthPx.value = clampSidebarWidth(resizeWidthStart + delta);
}

function stopSidebarResize(): void {
  if (!resizeListenersAttached) return;
  resizeListenersAttached = false;
  document.body.style.removeProperty('cursor');
  document.body.style.removeProperty('user-select');
  window.removeEventListener('pointermove', onSidebarResizePointerMove);
  window.removeEventListener('pointerup', stopSidebarResize);
  window.removeEventListener('pointercancel', stopSidebarResize);
  persistSidebarWidth();
}

function onSidebarResizePointerMove(e: PointerEvent): void {
  applySidebarResizeDelta(e.clientX);
}

function onSidebarResizePointerDown(e: PointerEvent): void {
  if (e.button !== 0) return;
  if (typeof window !== 'undefined' && window.innerWidth < 768) return;
  e.preventDefault();
  resizePointerStartX = e.clientX;
  resizeWidthStart = sidebarWidthPx.value;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  resizeListenersAttached = true;
  window.addEventListener('pointermove', onSidebarResizePointerMove);
  window.addEventListener('pointerup', stopSidebarResize);
  window.addEventListener('pointercancel', stopSidebarResize);
}

const renamingId = ref<string | null>(null);
const renameDraft = ref('');
const archivedOpen = ref(false);

const activeChats = computed(() => props.chats.filter((c) => !c.archived));
const archivedChats = computed(() => props.chats.filter((c) => c.archived));

const hasArchivableSelection = computed(() =>
  props.selectedChatIds.some((id) => {
    const c = props.chats.find((x) => x.id === id);
    return c !== undefined && !c.archived;
  })
);

const hasAnySelection = computed(() => props.selectedChatIds.length > 0);

watch(
  () => [props.activeChatId, archivedChats.value] as const,
  () => {
    const id = props.activeChatId;
    if (id && archivedChats.value.some((c) => c.id === id)) {
      archivedOpen.value = true;
    }
  },
  { immediate: true }
);

function closeMobileNav(): void {
  emit('update:mobileOpen', false);
}

function onOverlayClick(): void {
  closeMobileNav();
}

function onEscape(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.selectMode) return;
  if (e.key === 'Escape' && props.mobileOpen) closeMobileNav();
}

onMounted(() => window.addEventListener('keydown', onEscape));
onUnmounted(() => {
  window.removeEventListener('keydown', onEscape);
  stopSidebarResize();
});

function startRenameFor(chat: ChatSummary): void {
  renamingId.value = chat.id;
  renameDraft.value = chat.title;
}

function cancelRename(): void {
  renamingId.value = null;
}

function onRowDelete(id: string): void {
  emit('delete', id);
}

function onRowArchive(id: string): void {
  emit('archive', id);
}

function onRowUnarchive(id: string): void {
  emit('unarchive', id);
}

function onRowRename(id: string, title: string): void {
  emit('rename', id, title);
}

function toggleArchivedSection(): void {
  archivedOpen.value = !archivedOpen.value;
}

function openSettings(): void {
  closeMobileNav();
  emit('open-settings');
}
</script>

<template>
  <div
    class="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] transition-opacity duration-200 md:hidden"
    :class="
      mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
    "
    aria-hidden="true"
    @click="onOverlayClick"
  />

  <aside
    class="fixed inset-y-0 start-0 z-50 flex h-screen max-md:w-[260px] shrink-0 flex-col border-e border-sidebar-border bg-sidebar/45 backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-sidebar/30 transition-transform duration-200 ease-out dark:bg-sidebar/35 dark:supports-[backdrop-filter]:bg-sidebar/22 md:relative md:inset-auto md:z-auto md:w-[var(--sidebar-panel-width)] md:translate-x-0"
    :style="{ '--sidebar-panel-width': `${sidebarWidthPx}px` }"
    :class="
      mobileOpen
        ? 'translate-x-0'
        : 'ltr:max-md:-translate-x-full rtl:max-md:translate-x-full'
    "
  >
    <div
      class="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border/70 px-4"
    >
      <RouterLink
        :to="{ name: 'home' }"
        class="group flex min-w-0 items-center rounded-md p-1 -ms-1 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        :aria-label="t('sidebar.homeAria')"
        @click="closeMobileNav"
      >
        <img
          src="/logo.svg?v=7"
          alt=""
          width="105"
          height="35"
          class="h-7 w-auto max-w-[min(128px,40vw)] shrink-0 object-contain object-left opacity-70 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 dark:invert"
          aria-hidden="true"
        />
      </RouterLink>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        class="shrink-0"
        :aria-label="t('settings.openSettings')"
        @click="openSettings"
      >
        <Settings2 class="size-4" />
      </Button>
    </div>

    <div class="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-2">
      <div class="shrink-0 px-1 pb-2">
        <template v-if="!selectMode">
          <Button
            type="button"
            variant="ghost"
            class="h-10 w-full"
            :aria-label="t('sidebar.newChatAria')"
            @click="emit('new-chat')"
          >
            <Plus class="size-4" />
          </Button>
        </template>
        <div v-else class="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-10 shrink-0"
            :aria-label="t('sidebar.selectDoneAria')"
            @click="emit('exit-select')"
          >
            <X class="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            class="h-10 min-w-0 flex-1"
            :disabled="!hasArchivableSelection"
            :aria-label="t('sidebar.selectArchiveAria')"
            @click="emit('bulk-archive')"
          >
            <Archive class="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            class="h-10 min-w-0 flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
            :disabled="!hasAnySelection"
            :aria-label="t('sidebar.selectDeleteAria')"
            @click="emit('bulk-delete')"
          >
            <Trash2 class="size-4" />
          </Button>
        </div>
      </div>

      <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-1 px-1 py-1">
        <div class="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div
            v-if="activeChats.length === 0 && archivedChats.length === 0"
            class="px-2 py-6 text-center text-xs text-muted-foreground"
          >
            {{ t('sidebar.emptyNone') }}
          </div>
          <div v-else-if="activeChats.length === 0" class="px-2 py-6 text-center text-xs text-muted-foreground">
            {{ t('sidebar.emptyActive') }}
          </div>
          <div v-else class="space-y-0.5">
            <SidebarChatRow
              v-for="chat in activeChats"
              :key="chat.id"
              :chat="chat"
              :design-tools="designTools"
              :active-chat-id="activeChatId"
              :is-renaming="renamingId === chat.id"
              :rename-draft="renameDraft"
              :in-archived-list="false"
              :select-mode="selectMode"
              :selected="selectedChatIds.includes(chat.id)"
              @select="emit('select', $event)"
              @enter-select-with="emit('enter-select-with', $event)"
              @toggle-selected="emit('toggle-selected', $event)"
              @start-rename="startRenameFor(chat)"
              @update:rename-draft="renameDraft = $event"
              @rename="onRowRename"
              @cancel-rename="cancelRename"
              @delete="onRowDelete"
              @archive="onRowArchive"
              @unarchive="onRowUnarchive"
            />
          </div>
        </div>

        <div v-if="archivedChats.length > 0" class="shrink-0 border-t border-sidebar-border/60 pt-1">
          <button
            type="button"
            class="flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-start text-xs font-medium text-muted-foreground hover:bg-accent/40"
            :aria-expanded="archivedOpen"
            @click.stop="toggleArchivedSection"
          >
            <ChevronRight v-if="!archivedOpen" class="size-3.5 shrink-0 rtl:scale-x-[-1]" />
            <ChevronDown v-else class="size-3.5 shrink-0" />
            <span>{{ t('sidebar.archived') }}</span>
            <span class="tabular-nums text-[10px] opacity-80">({{ archivedChats.length }})</span>
          </button>
          <div v-if="archivedOpen" class="max-h-[40vh] space-y-0.5 overflow-y-auto pb-1">
            <SidebarChatRow
              v-for="chat in archivedChats"
              :key="chat.id"
              :chat="chat"
              :design-tools="designTools"
              :active-chat-id="activeChatId"
              :is-renaming="renamingId === chat.id"
              :rename-draft="renameDraft"
              :in-archived-list="true"
              :select-mode="selectMode"
              :selected="selectedChatIds.includes(chat.id)"
              @select="emit('select', $event)"
              @enter-select-with="emit('enter-select-with', $event)"
              @toggle-selected="emit('toggle-selected', $event)"
              @start-rename="startRenameFor(chat)"
              @update:rename-draft="renameDraft = $event"
              @rename="onRowRename"
              @cancel-rename="cancelRename"
              @delete="onRowDelete"
              @archive="onRowArchive"
              @unarchive="onRowUnarchive"
            />
          </div>
        </div>
      </div>
    </div>

    <button
      type="button"
      class="absolute inset-y-0 end-0 z-30 hidden w-2 cursor-col-resize touch-none border-0 bg-transparent p-0 outline-none hover:bg-foreground/[0.06] md:block focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
      :aria-label="t('sidebar.resizeAria')"
      @pointerdown="onSidebarResizePointerDown"
    />
  </aside>
</template>
