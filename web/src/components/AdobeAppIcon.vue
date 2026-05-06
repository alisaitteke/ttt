<script setup lang="ts">
import { computed } from 'vue';

export type AdobeMnemonicApp = 'ps' | 'ai' | 'ae' | 'pr' | 'id' | 'xd' | 'lr';

export type AdobeApp = AdobeMnemonicApp | 'figma' | 'davinci' | 'docker' | 'whatsapp' | 'giphy';

const SVG_BRAND_APPS = new Set<AdobeApp>(['figma', 'davinci', 'docker', 'whatsapp', 'giphy']);

interface AppMeta {
  label: string;
  bg: string;
  fg: string;
}

const APP_META: Record<AdobeMnemonicApp, AppMeta> = {
  ps: { label: 'Ps', bg: '#001E36', fg: '#31A8FF' },
  ai: { label: 'Ai', bg: '#330000', fg: '#FF9A00' },
  ae: { label: 'Ae', bg: '#00005B', fg: '#9999FF' },
  pr: { label: 'Pr', bg: '#00005B', fg: '#EA77FF' },
  id: { label: 'Id', bg: '#49021F', fg: '#F36' },
  xd: { label: 'Xd', bg: '#1E0033', fg: '#FF61F6' },
  lr: { label: 'Lr', bg: '#001E36', fg: '#31A8FF' },
};

const props = withDefaults(
  defineProps<{
    app: AdobeApp;
    size?: number;
  }>(),
  { size: 32 }
);

const useSvg = computed(() => SVG_BRAND_APPS.has(props.app));

const svgSrc = computed(() => {
  const base = import.meta.env.BASE_URL;
  if (props.app === 'figma') return `${base}figma-logo.svg`;
  if (props.app === 'davinci') return `${base}davinci-resolve-logo.svg`;
  if (props.app === 'docker') return `${base}docker-mark.svg`;
  if (props.app === 'whatsapp') return `${base}whatsapp-mark.svg`;
  if (props.app === 'giphy') return `${base}giphy-mark.svg`;
  return '';
});

const svgAlt = computed(() => {
  if (props.app === 'figma') return 'Figma';
  if (props.app === 'davinci') return 'DaVinci Resolve';
  if (props.app === 'docker') return 'Docker';
  if (props.app === 'whatsapp') return 'WhatsApp';
  if (props.app === 'giphy') return 'GIPHY';
  return '';
});

const meta = computed(() => APP_META[props.app as AdobeMnemonicApp]);

const frameStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  borderRadius: `${Math.max(2, Math.round(props.size * 0.1875))}px`,
}));

const mnemonicStyle = computed(() => ({
  ...frameStyle.value,
  background: meta.value.bg,
  color: meta.value.fg,
  fontSize: `${Math.round(props.size * 0.55)}px`,
}));
</script>

<template>
  <div
    v-if="useSvg"
    class="adobe-app-icon adobe-app-icon--svg"
    :style="frameStyle"
  >
    <img
      :src="svgSrc"
      :alt="svgAlt"
      class="adobe-app-icon__img"
      :class="app === 'davinci' ? 'dark:invert' : ''"
      draggable="false"
    />
  </div>
  <div
    v-else
    class="adobe-app-icon"
    :style="mnemonicStyle"
    :aria-label="meta.label"
  >
    <span class="adobe-app-icon__label">{{ meta.label }}</span>
  </div>
</template>

<style scoped>
.adobe-app-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  user-select: none;
  font-family: var(--font-mnemonic);
}

.adobe-app-icon--svg {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  overflow: hidden;
  background: transparent;
}

.adobe-app-icon__img {
  width: 88%;
  height: 88%;
  object-fit: contain;
}

.adobe-app-icon__label {
  font-weight: 900;
  letter-spacing: -0.06em;
  line-height: 1;
  transform: translateY(0.04em);
}
</style>
