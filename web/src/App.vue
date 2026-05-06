<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import Onboarding from './components/Onboarding.vue';
import ChatView from './components/ChatView.vue';
import Sidebar from './components/Sidebar.vue';
import SettingsDialog from './components/SettingsDialog.vue';
import ShellBackgroundGlow from './components/ShellBackgroundGlow.vue';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useChatStore } from './stores/chat';
import {
  apiListProviders,
  apiListDesignTools,
  apiStatus,
  type ConnectionProviderId,
  type ProviderInfo,
  type DesignToolInfo,
  type SettingsOpenPayload,
  type SettingsTab,
  type Status,
} from './lib/api';

const status = ref<Status | null>(null);
const providers = ref<ProviderInfo[]>([]);
const designTools = ref<DesignToolInfo[]>([]);
const creativeCloudDesktopInstalled = ref(false);
const loading = ref(true);
const fatalError = ref<string | null>(null);
const settingsOpen = ref(false);
const settingsInitialTab = ref<SettingsTab>('appearance');
const settingsFocusConnection = ref<ConnectionProviderId | null>(null);

function handleOpenSettings(payload?: SettingsOpenPayload): void {
  if (typeof payload === 'string') {
    settingsInitialTab.value = payload;
    settingsFocusConnection.value = null;
  } else if (payload && typeof payload === 'object') {
    settingsInitialTab.value = payload.tab ?? 'connections';
    settingsFocusConnection.value = payload.focusConnection ?? null;
  } else {
    settingsInitialTab.value = 'appearance';
    settingsFocusConnection.value = null;
  }
  settingsOpen.value = true;
}

watch(settingsOpen, (o) => {
  if (!o) settingsFocusConnection.value = null;
});
const sidebarMobileOpen = ref(false);
const composerFocusToken = ref(0);
const chatListSelectMode = ref(false);
const chatListSelectedIds = ref<string[]>([]);

const deleteConfirmOpen = ref(false);
const deleteConfirmIsBulk = ref(false);
const deleteConfirmSingleId = ref<string | null>(null);

const { t } = useI18n();
const chat = useChatStore();
const route = useRoute();
const router = useRouter();

const hasAnyKey = computed(() => providers.value.some((p) => p.hasApiKey));

const deleteConfirmTitle = computed(() =>
  deleteConfirmIsBulk.value
    ? t('sidebar.deleteConfirmTitleBulk', {
        count: chatListSelectedIds.value.length,
      })
    : t('sidebar.deleteConfirmTitle')
);

const hostPlatform = computed(() => status.value?.hostPlatform ?? 'linux');
provide('hostPlatform', hostPlatform);

function routeChatId(): string | null {
  const id = route.params.id;
  return typeof id === 'string' && id ? id : null;
}

async function syncFromRoute(): Promise<void> {
  const id = routeChatId();
  if (!id) {
    if (chat.activeChatId.value !== null) {
      chat.activeChatId.value = null;
      chat.messages.splice(0, chat.messages.length);
    }
    return;
  }
  if (chat.activeChatId.value === id) return;
  if (!chat.chats.value.some((c) => c.id === id)) {
    await router.replace({ name: 'home' });
    return;
  }
  await chat.selectChat(id);
}

async function refresh(): Promise<void> {
  try {
    const [st, provs, designRes] = await Promise.all([
      apiStatus(),
      apiListProviders(),
      apiListDesignTools(),
    ]);
    status.value = st;
    providers.value = provs;
    designTools.value = designRes.tools;
    creativeCloudDesktopInstalled.value = designRes.creativeCloudDesktopInstalled;
    if (hasAnyKey.value) {
      await chat.loadChats();
      await syncFromRoute();
    }
  } catch (err) {
    fatalError.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

watch(
  () => route.params.id,
  () => {
    if (hasAnyKey.value) void syncFromRoute();
  }
);

async function handleNewChat(): Promise<void> {
  sidebarMobileOpen.value = false;
  const created = await chat.newChat();
  await router.push({ name: 'chat', params: { id: created.id } });
  await nextTick();
  composerFocusToken.value += 1;
}

function exitChatListSelectMode(): void {
  chatListSelectMode.value = false;
  chatListSelectedIds.value = [];
}

function enterChatListSelectModeWith(id: string): void {
  chatListSelectMode.value = true;
  chatListSelectedIds.value = [id];
}

function toggleChatListSelection(id: string): void {
  const s = new Set(chatListSelectedIds.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  chatListSelectedIds.value = [...s];
}

function onChatListSelectEscape(e: KeyboardEvent): void {
  if (e.key === 'Escape') exitChatListSelectMode();
}

watch(chatListSelectMode, (on) => {
  if (on) window.addEventListener('keydown', onChatListSelectEscape);
  else window.removeEventListener('keydown', onChatListSelectEscape);
});

async function handleSelect(id: string): Promise<void> {
  sidebarMobileOpen.value = false;
  await router.push({ name: 'chat', params: { id } });
}

async function handleBulkArchive(): Promise<void> {
  const ids = chatListSelectedIds.value.filter((id) => {
    const c = chat.chats.value.find((x) => x.id === id);
    return c && !c.archived;
  });
  if (ids.length === 0) return;
  await chat.setManyChatsArchived(ids);
  exitChatListSelectMode();
}

async function handleBulkDelete(): Promise<void> {
  const ids = [...chatListSelectedIds.value];
  if (ids.length === 0) return;
  const active = chat.activeChatId.value;
  const hitActive = active !== null && ids.includes(active);
  for (const id of ids) {
    await chat.removeChat(id);
  }
  if (hitActive) await router.replace({ name: 'home' });
  exitChatListSelectMode();
}

function requestDeleteChat(id: string): void {
  deleteConfirmIsBulk.value = false;
  deleteConfirmSingleId.value = id;
  deleteConfirmOpen.value = true;
}

function requestBulkDelete(): void {
  if (chatListSelectedIds.value.length === 0) return;
  deleteConfirmIsBulk.value = true;
  deleteConfirmSingleId.value = null;
  deleteConfirmOpen.value = true;
}

function onDeleteConfirmOpenUpdate(open: boolean): void {
  deleteConfirmOpen.value = open;
  if (!open) {
    deleteConfirmIsBulk.value = false;
    deleteConfirmSingleId.value = null;
  }
}

async function confirmPendingDelete(): Promise<void> {
  const isBulk = deleteConfirmIsBulk.value;
  const singleId = deleteConfirmSingleId.value;
  deleteConfirmOpen.value = false;
  deleteConfirmIsBulk.value = false;
  deleteConfirmSingleId.value = null;
  if (isBulk) await handleBulkDelete();
  else if (singleId) await handleDelete(singleId);
}

async function handleDelete(id: string): Promise<void> {
  const wasActive = chat.activeChatId.value === id;
  await chat.removeChat(id);
  if (wasActive) {
    await router.replace({ name: 'home' });
  }
}

async function handleArchive(id: string): Promise<void> {
  await chat.setChatArchived(id, true);
}

async function handleUnarchive(id: string): Promise<void> {
  await chat.setChatArchived(id, false);
}

async function handleSettingsSaved(): Promise<void> {
  await refresh();
}

function openMobileSidebar(): void {
  sidebarMobileOpen.value = true;
}

onMounted(refresh);

onUnmounted(() => {
  window.removeEventListener('keydown', onChatListSelectEscape);
});
</script>

<template>
  <div v-if="loading" class="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
    {{ t('app.loading') }}
  </div>
  <div v-else-if="fatalError" class="flex min-h-screen items-center justify-center p-6">
    <div class="max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
      {{ fatalError }}
    </div>
  </div>
  <template v-else>
    <ShellBackgroundGlow />
    <div class="relative z-10 min-h-screen">
      <Onboarding v-if="!hasAnyKey" @saved="refresh" />
      <div v-else class="flex h-screen min-h-0">
        <Sidebar
          v-model:mobile-open="sidebarMobileOpen"
          :chats="chat.chats.value"
          :design-tools="designTools"
          :active-chat-id="chat.activeChatId.value"
          :select-mode="chatListSelectMode"
          :selected-chat-ids="chatListSelectedIds"
          @new-chat="handleNewChat"
          @select="handleSelect"
          @rename="(id, title) => chat.rename(id, title)"
          @delete="requestDeleteChat"
          @archive="handleArchive"
          @unarchive="handleUnarchive"
          @open-settings="handleOpenSettings('appearance')"
          @exit-select="exitChatListSelectMode"
          @enter-select-with="enterChatListSelectModeWith"
          @toggle-selected="toggleChatListSelection"
          @bulk-archive="handleBulkArchive"
          @bulk-delete="requestBulkDelete"
        />
        <Dialog :open="deleteConfirmOpen" @update:open="onDeleteConfirmOpenUpdate">
          <DialogContent class="gap-4 p-5 sm:max-w-md">
            <DialogTitle class="text-base font-semibold leading-snug">
              {{ deleteConfirmTitle }}
            </DialogTitle>
            <p class="text-sm text-muted-foreground">
              {{ t('sidebar.deleteConfirmDescription') }}
            </p>
            <div class="flex flex-wrap justify-end gap-2">
              <DialogClose as-child>
                <Button type="button" variant="outline">
                  {{ t('sidebar.deleteConfirmCancel') }}
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                @click="confirmPendingDelete"
              >
                {{ t('sidebar.deleteConfirmAction') }}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <ChatView
          class="min-w-0 flex-1"
          :providers="providers"
          :design-tools="designTools"
          :creative-cloud-desktop-installed="creativeCloudDesktopInstalled"
          :store="chat"
          :settings-open="settingsOpen"
          :sidebar-mobile-open="sidebarMobileOpen"
          :composer-focus-token="composerFocusToken"
          @new-chat="handleNewChat"
          @open-settings="handleOpenSettings($event)"
          @open-sidebar="openMobileSidebar"
        />
        <SettingsDialog
          v-model:open="settingsOpen"
          :initial-tab="settingsInitialTab"
          :focus-connection="settingsFocusConnection"
          @saved="handleSettingsSaved"
        />
      </div>
    </div>
  </template>
</template>
