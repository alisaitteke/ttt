/**
 * Machine-readable lines embedded in MCP tool text output for the TTT chat UI.
 * Any provider may append these; clients (web, future surfaces) interpret them
 * without coupling to a specific tool name.
 *
 * - TTT_REVEAL_PATH — absolute filesystem path; UI may offer "reveal in folder"
 *   and auto-expand the tool card on success so the path is visible.
 *
 * Add new prefixes here only (documented, version-stable); do not key off tool names in UI.
 */
export const TTT_REVEAL_PATH_PREFIX = 'TTT_REVEAL_PATH:' as const;
