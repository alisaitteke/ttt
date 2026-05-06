import { sanitizeDesignToolIds, type DesignToolId } from '@ttt/ui/providers/design-tools.js';
import { kvGet, kvSet } from '@ttt/ui/store/kv.js';

const LAST_COMPOSER_DESIGN_TOOLS_KV = 'last_composer_design_tools';

export function getLastComposerDesignToolsPreference(): DesignToolId[] | undefined {
  const raw = kvGet<unknown>(LAST_COMPOSER_DESIGN_TOOLS_KV);
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return undefined;
  return sanitizeDesignToolIds(raw);
}

export function setLastComposerDesignToolsPreference(ids: readonly DesignToolId[]): void {
  kvSet(LAST_COMPOSER_DESIGN_TOOLS_KV, sanitizeDesignToolIds(ids));
}
