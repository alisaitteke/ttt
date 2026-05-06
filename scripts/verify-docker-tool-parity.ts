/**
 * Verifies TTT registers every tool name exposed by @alisaitteke/docker-mcp
 * plus docker_ping. Run: npx tsx scripts/verify-docker-tool-parity.ts
 */
import assert from 'node:assert/strict';
import { getComposeTools } from '@alisaitteke/docker-mcp/dist/tools/compose.js';
import { getContainerTools } from '@alisaitteke/docker-mcp/dist/tools/containers.js';
import { getExecTools } from '@alisaitteke/docker-mcp/dist/tools/exec.js';
import { getImageTools } from '@alisaitteke/docker-mcp/dist/tools/images.js';
import { getNetworkTools } from '@alisaitteke/docker-mcp/dist/tools/networks.js';
import { getRegistryTools } from '@alisaitteke/docker-mcp/dist/tools/registries.js';
import { getSystemTools } from '@alisaitteke/docker-mcp/dist/tools/system.js';
import { getVolumeTools } from '@alisaitteke/docker-mcp/dist/tools/volumes.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import dockerProvider from '../src/providers/docker/index.js';

const mcpNames = [
  ...getContainerTools(),
  ...getImageTools(),
  ...getNetworkTools(),
  ...getVolumeTools(),
  ...getSystemTools(),
  ...getExecTools(),
  ...getComposeTools(),
  ...getRegistryTools(),
].map((t) => t.name);

assert.equal(
  mcpNames.length,
  new Set(mcpNames).size,
  'Duplicate tool names in upstream docker-mcp tool lists'
);

const registry = new ToolRegistry();
dockerProvider.register(registry);

assert.ok(registry.has('docker_ping'), 'docker_ping must be registered');

for (const name of mcpNames) {
  assert.ok(registry.has(name), `Missing registry entry for ${name}`);
}

assert.equal(
  registry.count(),
  mcpNames.length + 1,
  'Registry tool count should equal upstream tools + docker_ping'
);

console.log(`OK: ${mcpNames.length} docker-mcp tools + docker_ping = ${registry.count()} registered.`);
