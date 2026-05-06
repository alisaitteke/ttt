import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ComposeManager } from '@alisaitteke/docker-mcp/dist/managers/compose.js';
import type { ContainerManager } from '@alisaitteke/docker-mcp/dist/managers/container.js';
import type { ExecManager } from '@alisaitteke/docker-mcp/dist/managers/exec.js';
import type { ImageManager } from '@alisaitteke/docker-mcp/dist/managers/image.js';
import type { NetworkManager } from '@alisaitteke/docker-mcp/dist/managers/network.js';
import type { SystemManager } from '@alisaitteke/docker-mcp/dist/managers/system.js';
import type { VolumeManager } from '@alisaitteke/docker-mcp/dist/managers/volume.js';
import type { GHCRClient } from '@alisaitteke/docker-mcp/dist/registries/ghcr.js';
import type { DockerHubClient } from '@alisaitteke/docker-mcp/dist/registries/dockerhub.js';

import { handleComposeTool } from '@alisaitteke/docker-mcp/dist/tools/compose.js';
import { handleContainerTool } from '@alisaitteke/docker-mcp/dist/tools/containers.js';
import { handleExecTool } from '@alisaitteke/docker-mcp/dist/tools/exec.js';
import { handleImageTool } from '@alisaitteke/docker-mcp/dist/tools/images.js';
import { handleNetworkTool } from '@alisaitteke/docker-mcp/dist/tools/networks.js';
import { handleRegistryTool } from '@alisaitteke/docker-mcp/dist/tools/registries.js';
import { handleSystemTool } from '@alisaitteke/docker-mcp/dist/tools/system.js';
import { handleVolumeTool } from '@alisaitteke/docker-mcp/dist/tools/volumes.js';

/** Same handler order as `@alisaitteke/docker-mcp/dist/tools/index.js`. */
export interface DockerMcpManagers {
  readonly containerManager: ContainerManager;
  readonly imageManager: ImageManager;
  readonly networkManager: NetworkManager;
  readonly volumeManager: VolumeManager;
  readonly systemManager: SystemManager;
  readonly execManager: ExecManager;
  readonly composeManager: ComposeManager;
  readonly dockerHubClient: DockerHubClient;
  readonly ghcrClient: GHCRClient;
}

export async function dispatchDockerTool(
  name: string,
  args: Record<string, unknown>,
  mcp: DockerMcpManagers
): Promise<CallToolResult> {
  const handlers = [
    () => handleContainerTool(name, args, mcp.containerManager),
    () => handleImageTool(name, args, mcp.imageManager),
    () => handleNetworkTool(name, args, mcp.networkManager),
    () => handleVolumeTool(name, args, mcp.volumeManager, undefined),
    () => handleSystemTool(name, args, mcp.systemManager),
    () => handleExecTool(name, args, mcp.execManager),
    () => handleComposeTool(name, args, mcp.composeManager),
    () => handleRegistryTool(name, args, mcp.dockerHubClient, mcp.ghcrClient, mcp.imageManager),
  ];

  for (const run of handlers) {
    try {
      const result: unknown = await run();
      if (result !== null && result !== undefined) {
        return result as CallToolResult;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Unknown tool')) {
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Unknown tool: ${name}`);
}
