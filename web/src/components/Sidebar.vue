<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ChevronDown, ChevronRight, Plus, Settings2 } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import SidebarChatRow from '@/components/SidebarChatRow.vue';
import type { ChatSummary } from '@/lib/api';

const props = defineProps<{
  chats: ChatSummary[];
  activeChatId: string | null;
  mobileOpen: boolean;
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
}>();

const { t } = useI18n();

const renamingId = ref<string | null>(null);
const renameDraft = ref('');
const archivedOpen = ref(false);

const activeChats = computed(() => props.chats.filter((c) => !c.archived));
const archivedChats = computed(() => props.chats.filter((c) => c.archived));

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

const npmVersion = import.meta.env.VITE_TTT_NPM_VERSION;

function closeMobileNav(): void {
  emit('update:mobileOpen', false);
}

function onOverlayClick(): void {
  closeMobileNav();
}

function onEscape(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.mobileOpen) closeMobileNav();
}

onMounted(() => window.addEventListener('keydown', onEscape));
onUnmounted(() => window.removeEventListener('keydown', onEscape));

function startRenameFor(chat: ChatSummary): void {
  renamingId.value = chat.id;
  renameDraft.value = chat.title;
}

function cancelRename(): void {
  renamingId.value = null;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
    class="fixed inset-y-0 start-0 z-50 flex h-screen w-[260px] shrink-0 flex-col border-e border-border/50 bg-background/20 backdrop-blur-2xl backdrop-saturate-150 transition-transform duration-200 ease-out dark:bg-background/[0.14] md:relative md:inset-auto md:z-auto md:translate-x-0"
    :class="
      mobileOpen
        ? 'translate-x-0'
        : 'ltr:max-md:-translate-x-full rtl:max-md:translate-x-full'
    "
  >
    <div
      class="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/50 px-4"
    >
      <RouterLink
        :to="{ name: 'home' }"
        class="flex min-w-0 items-center gap-2 rounded-md p-1 -ms-1 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        :aria-label="t('sidebar.homeAria')"
        @click="closeMobileNav"
      >
        <img
          src="/ttt-logo.svg?v=0.8"
          alt=""
          width="32"
          height="32"
          class="size-8 shrink-0 object-contain"
          aria-hidden="true"
        />
        <div class="flex min-w-0 flex-col items-start gap-px leading-none">
          <span
            class="inline-block [font-family:var(--font-mnemonic)] text-2xl font-black leading-none tracking-[-0.06em] [transform:translateY(0.04em)]"
          >TTT</span>
          <span class="text-[10px] tabular-nums text-muted-foreground">v{{ npmVersion }}</span>
        </div>
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
        <Button
          type="button"
          variant="ghost"
          class="h-10 w-full"
          :aria-label="t('sidebar.newChatAria')"
          @click="emit('new-chat')"
        >
          <Plus class="size-4" />
        </Button>
      </div>

      <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
        <div class="min-h-0 min-w-0 flex-1 overflow-y-auto px-0">
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
              :active-chat-id="activeChatId"
              :is-renaming="renamingId === chat.id"
              :rename-draft="renameDraft"
              :in-archived-list="false"
              :format-date="formatDate"
              @select="emit('select', $event)"
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

        <div v-if="archivedChats.length > 0" class="shrink-0 border-t border-border/40 pt-1">
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
              :active-chat-id="activeChatId"
              :is-renaming="renamingId === chat.id"
              :rename-draft="renameDraft"
              :in-archived-list="true"
              :format-date="formatDate"
              @select="emit('select', $event)"
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
  </aside>
</template>
