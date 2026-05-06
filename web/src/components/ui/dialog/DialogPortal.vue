<script setup lang="ts">
import {
  DialogPortal,
  type DialogPortalProps,
  useForwardProps,
} from 'reka-ui';

const props = defineProps<DialogPortalProps>();

const forwarded = useForwardProps(props);
</script>

<template>
  <DialogPortal v-bind="forwarded">
    <slot />
  </DialogPortal>
</template>
