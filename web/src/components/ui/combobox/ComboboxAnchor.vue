<script setup lang="ts">
import {
  ComboboxAnchor,
  type ComboboxAnchorProps,
  useForwardProps,
} from 'reka-ui';

const props = defineProps<ComboboxAnchorProps & { class?: string }>();

const forwarded = useForwardProps(props);
</script>

<template>
  <ComboboxAnchor
    v-bind="forwarded"
    :class="props.class"
  >
    <slot />
  </ComboboxAnchor>
</template>
