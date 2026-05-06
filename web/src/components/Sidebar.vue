<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { MessageSquarePlus, MoreHorizontal, Pencil, Settings2, Trash2 } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import ThemeToggle from '@/components/ThemeToggle.vue';
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
  'open-settings': [];
  'update:mobileOpen': [open: boolean];
}>();

const menuOpenFor = ref<string | null>(null);
const renamingId = ref<string | null>(null);
const renameDraft = ref('');

const npmVersion = import.meta.env.VITE_TTT_NPM_VERSION;

function closeMobileNav(): void {
  emit('update:mobileOpen', false);
}

function onOverlayClick(): void {
  closeMobileNav();
}

function openSettings(): void {
  closeMobileNav();
  emit('open-settings');
}

function onEscape(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.mobileOpen) closeMobileNav();
}

onMounted(() => window.addEventListener('keydown', onEscape));
onUnmounted(() => window.removeEventListener('keydown', onEscape));

function toggleMenu(id: string, event: Event): void {
  event.stopPropagation();
  menuOpenFor.value = menuOpenFor.value === id ? null : id;
}

function startRename(chat: ChatSummary, event: Event): void {
  event.stopPropagation();
  renamingId.value = chat.id;
  renameDraft.value = chat.title;
  menuOpenFor.value = null;
}

function commitRename(id: string): void {
  const title = renameDraft.value.trim();
  if (title) emit('rename', id, title);
  renamingId.value = null;
}

function cancelRename(): void {
  renamingId.value = null;
}

function onDelete(id: string, event: Event): void {
  event.stopPropagation();
  menuOpenFor.value = null;
  emit('delete', id);
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
    class="fixed inset-y-0 left-0 z-50 flex h-screen w-[260px] shrink-0 flex-col border-r border-border/50 bg-background/20 backdrop-blur-2xl backdrop-saturate-150 transition-transform duration-200 ease-out dark:bg-background/[0.14] md:relative md:inset-auto md:z-auto md:translate-x-0"
    :class="
      mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
    "
    @click="menuOpenFor = null"
  >
    <div
      class="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/50 px-4"
    >
      <RouterLink
        :to="{ name: 'home' }"
        class="flex min-w-0 items-center gap-2 rounded-md p-1 -ml-1 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="Home"
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
      <ThemeToggle />
    </div>

    <div class="px-3 pt-3">
      <Button class="w-full justify-start gap-2" variant="outline" @click="emit('new-chat')">
        <MessageSquarePlus class="size-4" />
        New chat
      </Button>
    </div>

    <div class="mt-3 flex-1 overflow-y-auto px-2">
      <div v-if="props.chats.length === 0" class="px-2 py-6 text-center text-xs text-muted-foreground">
        No chats yet.
      </div>
      <div v-else class="space-y-0.5">
        <div
          v-for="chat in props.chats"
          :key="chat.id"
          class="group relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40"
          :class="{ 'bg-accent/45': chat.id === props.activeChatId }"
          @click="emit('select', chat.id)"
        >
          <div class="min-w-0 flex-1">
            <input
              v-if="renamingId === chat.id"
              v-model="renameDraft"
              class="w-full rounded border border-input bg-background px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              autofocus
              @click.stop
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
            :class="{ visible: menuOpenFor === chat.id }"
            @click="toggleMenu(chat.id, $event)"
          >
            <MoreHorizontal class="size-3.5" />
          </button>

          <div
            v-if="menuOpenFor === chat.id"
            class="absolute right-1 top-9 z-10 w-32 rounded-md border border-border bg-popover p-1 text-sm shadow-md"
            @click.stop
          >
            <button
              class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent"
              @click="startRename(chat, $event)"
            >
              <Pencil class="size-3.5" />
              Rename
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
      </div>
    </div>

    <div class="flex h-9 shrink-0 items-stretch border-t border-border/50 bg-background/10 backdrop-blur-xl dark:bg-background/[0.08]">
      <Button
        variant="ghost"
        class="m-0 h-full w-full min-h-0 justify-start gap-2 rounded-none px-4 py-0 text-xs font-medium shadow-none"
        @click="openSettings"
      >
        <Settings2 class="size-4 shrink-0" />
        Settings
      </Button>
    </div>
  </aside>
</template>
