<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDown, Check, Lock } from 'lucide-vue-next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import AdobeAppIcon from './AdobeAppIcon.vue';
import { apiLaunchCreativeCloud, type DesignToolId, type DesignToolInfo } from '@/lib/api';

const props = defineProps<{
  designTools: DesignToolInfo[];
  creativeCloudDesktopInstalled?: boolean;
  selected: DesignToolId[] | null;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:tools': [value: DesignToolId[]];
}>();

const open = ref(false);
const launchPending = ref(false);
const launchError = ref<string | null>(null);

async function openCreativeCloud(): Promise<void> {
  launchError.value = null;
  launchPending.value = true;
  try {
    await apiLaunchCreativeCloud();
  } catch (e) {
    launchError.value = e instanceof Error ? e.message : 'Launch failed';
  } finally {
    launchPending.value = false;
  }
}

function isSelectable(tool: DesignToolInfo): boolean {
  if (!tool.available) return false;
  if (tool.installed === false) return false;
  return true;
}

function rowLocked(tool: DesignToolInfo): boolean {
  if (!tool.available) return true;
  if (tool.installed === false && !selectedTools.value.includes(tool.id)) return true;
  return false;
}

function showInstallBlock(tool: DesignToolInfo): boolean {
  return tool.installed === false && Boolean(tool.installUrl);
}

/** (1) Installed/local-detected tier: true → unknown probe → explicitly not installed. */
function installedTierRank(tool: DesignToolInfo): number {
  if (tool.installed === true) return 0;
  if (tool.installed === undefined) return 1;
  return 2;
}

/** (2) Within the same tier, TTT-supported tools (`available`) first — then label. */
function supportedTierRank(tool: DesignToolInfo): number {
  return tool.available ? 0 : 1;
}

const sortedDesignTools = computed(() => {
  return [...props.designTools].sort((a, b) => {
    let d = installedTierRank(a) - installedTierRank(b);
    if (d !== 0) return d;
    d = supportedTierRank(a) - supportedTierRank(b);
    if (d !== 0) return d;
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });
});

const selectedTools = computed(() => {
  const fallback = props.designTools.filter(isSelectable).map((t) => t.id);
  const sel = props.selected ?? fallback;
  return sel;
});

const label = computed(() => {
  const count = selectedTools.value.length;
  const selectable = props.designTools.filter(isSelectable);
  if (count === 0) return 'No tools';
  if (count === selectable.length && selectable.length > 0) return 'All design tools';
  const labels = selectedTools.value
    .map((id) => props.designTools.find((t) => t.id === id)?.label)
    .filter(Boolean);
  return `Tools: ${labels.join(' + ')}`;
});

function onToolClick(tool: DesignToolInfo): void {
  if (!tool.available) return;

  const current = new Set(selectedTools.value);
  if (current.has(tool.id)) {
    current.delete(tool.id);
    emit('update:tools', Array.from(current));
    return;
  }

  if (!isSelectable(tool)) return;

  current.add(tool.id);
  emit('update:tools', Array.from(current));
}

function onRowActivate(tool: DesignToolInfo): void {
  if (rowLocked(tool)) return;
  onToolClick(tool);
}

function selectAll(): void {
  const selectable = props.designTools.filter(isSelectable).map((t) => t.id);
  emit('update:tools', selectable);
  open.value = false;
}

function clearAll(): void {
  emit('update:tools', []);
  open.value = false;
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        size="sm"
        :disabled="disabled"
        class="h-7 min-w-0 max-w-none gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground md:min-w-[10rem] md:max-w-[18rem] md:px-2.5"
        :aria-label="label"
      >
        <div class="flex shrink-0 -space-x-1.5">
          <AdobeAppIcon
            v-for="id in selectedTools.slice(0, 3)"
            :key="id"
            :app="designTools.find((t) => t.id === id)?.iconKey ?? 'ps'"
            :size="14"
            class="ring-1 ring-background"
          />
        </div>
        <span class="hidden min-w-0 flex-1 truncate text-left font-normal md:block">
          {{ label }}
        </span>
        <ChevronDown class="size-3.5 shrink-0 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      class="box-border w-[min(42rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] p-0"
      align="start"
      side="top"
    >
      <div class="border-b border-border/50 px-3 py-2.5">
        <div class="flex min-w-0 items-center justify-between gap-3">
          <span class="text-xs font-medium text-muted-foreground">Design Tools</span>
          <div class="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              class="text-[10px] text-primary hover:underline"
              @click="selectAll"
            >
              Select all
            </button>
            <span class="text-[10px] text-muted-foreground/60">·</span>
            <button
              type="button"
              class="text-[10px] text-primary hover:underline"
              @click="clearAll"
            >
              Clear all
            </button>
          </div>
        </div>
      </div>
      <div class="w-full min-w-0">
        <div class="max-h-[min(24rem,70vh)] overflow-x-hidden overflow-y-auto">
          <div
            class="sticky top-0 z-10 grid w-full min-w-0 grid-cols-[2rem_minmax(0,2fr)_minmax(0,1fr)_9.5rem] items-center gap-x-3 border-b border-border/40 bg-popover px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            aria-hidden="true"
          >
            <span class="text-center"> </span>
            <span class="min-w-0">Tool</span>
            <span class="min-w-0">Status</span>
            <span aria-hidden="true" class="min-w-0" />
          </div>
          <div
            v-for="tool in sortedDesignTools"
            :key="tool.id"
            role="button"
            :tabindex="rowLocked(tool) ? -1 : 0"
            class="grid w-full min-w-0 grid-cols-[2rem_minmax(0,2fr)_minmax(0,1fr)_9.5rem] items-center gap-x-3 border-b border-border/30 px-3 py-1.5 text-left text-sm outline-none last:border-b-0 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            :class="[
              rowLocked(tool) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-accent/80',
              selectedTools.includes(tool.id) && tool.available ? 'bg-accent/50' : '',
            ]"
            @keydown.enter.prevent="onRowActivate(tool)"
            @keydown.space.prevent="onRowActivate(tool)"
            @click="onRowActivate(tool)"
          >
            <span class="flex justify-center">
              <Check
                v-if="tool.available"
                class="size-4 shrink-0"
                :class="selectedTools.includes(tool.id) ? 'opacity-100' : 'opacity-0'"
              />
              <Lock v-else class="size-3.5 shrink-0 text-muted-foreground" />
            </span>
            <span class="flex min-w-0 items-center gap-2">
              <AdobeAppIcon :app="tool.iconKey" :size="18" class="shrink-0" />
              <span class="min-w-0 truncate font-medium">
                {{ tool.label }}
              </span>
            </span>
            <span class="flex min-h-[1.5rem] min-w-0 flex-col items-start justify-center gap-1" @click.stop>
              <template v-if="tool.installed === false">
                <span class="text-[10px] leading-tight whitespace-nowrap text-muted-foreground">
                  Not installed
                </span>
              </template>
              <template v-else-if="tool.installed === true">
                <span
                  class="text-[10px] leading-tight whitespace-nowrap rounded-full border px-1.5 py-0.5"
                  :class="
                    tool.available
                      ? 'border-border bg-muted/50 text-muted-foreground'
                      : 'border-primary/30 bg-primary/10 text-primary'
                  "
                >
                  Installed
                </span>
              </template>
              <span v-else class="text-[10px] text-muted-foreground/50">—</span>
            </span>
            <span class="flex min-h-7 min-w-0 justify-end" @click.stop>
              <template v-if="showInstallBlock(tool)">
                <button
                  v-if="creativeCloudDesktopInstalled"
                  type="button"
                  :disabled="launchPending || disabled"
                  class="inline-flex h-7 w-full max-w-[9.5rem] shrink-0 items-center justify-center rounded-md border border-input bg-background px-2 text-[10px] font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                  @click.stop="openCreativeCloud"
                >
                  {{ launchPending ? 'Opening…' : 'Open Creative Cloud' }}
                </button>
                <a
                  v-else
                  :href="tool.installUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex h-7 w-full max-w-[9.5rem] min-w-[4.5rem] shrink-0 items-center justify-center rounded-md border border-input bg-background px-2 text-[10px] font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  @click.stop
                >
                  Install
                </a>
              </template>
              <span v-else class="text-[10px] text-muted-foreground/50">—</span>
            </span>
          </div>
        </div>
      </div>
      <p
        v-if="launchError"
        class="border-t border-border/50 px-3 py-2 text-[10px] leading-snug text-destructive"
      >
        {{ launchError }}
      </p>
    </PopoverContent>
  </Popover>
</template>
