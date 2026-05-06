<script setup lang="ts">
import { computed } from 'vue';
import { Puzzle } from 'lucide-vue-next';
import AdobeAppIcon from '@/components/AdobeAppIcon.vue';
import type { IntegrationId } from '@/lib/api';

const props = withDefaults(
  defineProps<{
    integration: IntegrationId;
    size?: number;
  }>(),
  { size: 18 }
);

const useGiphyBrand = computed(() => props.integration === 'giphy');
const useHomeAssistant = computed(() => props.integration === 'homeassistant');
const usePexels = computed(() => props.integration === 'pexels');
const useShutterstock = computed(() => props.integration === 'shutterstock');
</script>

<template>
  <AdobeAppIcon v-if="useGiphyBrand" app="giphy" :size="size" />
  <!-- Home Assistant icon path from Simple Icons (npm simple-icons, CC0): homeassistant.svg -->
  <svg
    v-else-if="useHomeAssistant"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-hidden="true"
    class="shrink-0 text-muted-foreground"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
  >
    <path
      fill="currentColor"
      d="M22.939 10.627 13.061.749a1.505 1.505 0 0 0-2.121 0l-9.879 9.878C.478 11.21 0 12.363 0 13.187v9c0 .826.675 1.5 1.5 1.5h9.227l-4.063-4.062a2.034 2.034 0 0 1-.664.113c-1.13 0-2.05-.92-2.05-2.05s.92-2.05 2.05-2.05 2.05.92 2.05 2.05c0 .233-.041.456-.113.665l3.163 3.163V9.928a2.05 2.05 0 0 1-1.15-1.84c0-1.13.92-2.05 2.05-2.05s2.05.92 2.05 2.05a2.05 2.05 0 0 1-1.15 1.84v8.127l3.146-3.146A2.051 2.051 0 0 1 18 12.239c1.13 0 2.05.92 2.05 2.05s-.92 2.05-2.05 2.05c-.25 0-.488-.047-.709-.13L12.9 20.602v3.088h9.6c.825 0 1.5-.675 1.5-1.5v-9c0-.825-.477-1.977-1.061-2.561z"
    />
  </svg>
  <!-- Pexels mark from Simple Icons (CC0): pexels.svg -->
  <svg
    v-else-if="usePexels"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-hidden="true"
    class="shrink-0 text-muted-foreground"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
  >
    <path
      fill="currentColor"
      d="M1.5 0A1.5 1.5 0 000 1.5v21A1.5 1.5 0 001.5 24h21a1.5 1.5 0 001.5-1.5v-21A1.5 1.5 0 0022.5 0h-21zm6.75 6.75h5.2715a3.843 3.843 0 01.627 7.6348V17.25H8.25V6.75zm1.5 1.5v7.5h2.8984v-2.8145h.873a2.343 2.343 0 100-4.6855H9.75Z"
    />
  </svg>
  <!-- Shutterstock mark from Simple Icons (CC0): shutterstock.svg -->
  <svg
    v-else-if="useShutterstock"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-hidden="true"
    class="shrink-0 text-muted-foreground"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
  >
    <path
      fill="currentColor"
      d="M9.839 18.761h5.313a1.53 1.53 0 0 0 1.527-1.528v-5.76h5.237v5.76A6.767 6.767 0 0 1 15.152 24H9.839v-5.239M14.16 5.237H8.85a1.53 1.53 0 0 0-1.53 1.527v5.761H2.085V6.764A6.763 6.763 0 0 1 8.85 0h5.31v5.237Z"
    />
  </svg>
  <Puzzle v-else class="shrink-0 text-muted-foreground" :width="size" :height="size" />
</template>
