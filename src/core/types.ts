import type { ToolRegistry } from './tool-registry.js';

/**
 * A Provider is a single design tool integration (Photoshop, Figma, ...).
 *
 * It owns its own connection / lifecycle and contributes one or more MCP tools
 * to the shared registry. The MCP server is provider-agnostic: it iterates the
 * configured providers and calls `register()` on each at startup.
 *
 * Adding a new provider means:
 *   1. Drop a folder under `src/providers/<id>/`
 *   2. Export a `Provider` from its `index.ts`
 *   3. Wire it into `src/providers/index.ts`
 */
export interface Provider {
  /** Stable identifier, e.g. "photoshop", "figma". Used for logging only. */
  id: string;

  /** Human-readable label for diagnostics. */
  displayName: string;

  /** Register this provider's MCP tools with the shared registry. */
  register(registry: ToolRegistry): void | Promise<void>;

  /** Optional cleanup hook called when the MCP server stops. */
  shutdown?(): void | Promise<void>;
}
