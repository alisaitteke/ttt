import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { DockerClient } from '@alisaitteke/docker-mcp/dist/docker/client.js';
import { ComposeManager } from '@alisaitteke/docker-mcp/dist/managers/compose.js';
import { ContainerManager } from '@alisaitteke/docker-mcp/dist/managers/container.js';
import { ExecManager } from '@alisaitteke/docker-mcp/dist/managers/exec.js';
import { ImageManager } from '@alisaitteke/docker-mcp/dist/managers/image.js';
import { NetworkManager } from '@alisaitteke/docker-mcp/dist/managers/network.js';
import { SystemManager } from '@alisaitteke/docker-mcp/dist/managers/system.js';
import { VolumeManager } from '@alisaitteke/docker-mcp/dist/managers/volume.js';
import { DockerHubClient } from '@alisaitteke/docker-mcp/dist/registries/dockerhub.js';
import { GHCRClient } from '@alisaitteke/docker-mcp/dist/registries/ghcr.js';
import { getComposeTools } from '@alisaitteke/docker-mcp/dist/tools/compose.js';
import { getContainerTools } from '@alisaitteke/docker-mcp/dist/tools/containers.js';
import { getExecTools } from '@alisaitteke/docker-mcp/dist/tools/exec.js';
import { getImageTools } from '@alisaitteke/docker-mcp/dist/tools/images.js';
import { getNetworkTools } from '@alisaitteke/docker-mcp/dist/tools/networks.js';
import { getRegistryTools } from '@alisaitteke/docker-mcp/dist/tools/registries.js';
import { getSystemTools } from '@alisaitteke/docker-mcp/dist/tools/system.js';
import { getVolumeTools } from '@alisaitteke/docker-mcp/dist/tools/volumes.js';
import type { Provider } from '../../core/types.js';
import type { ToolRegistry, ToolResult } from '../../core/tool-registry.js';
import { Logger } from '../../utils/logger.js';
import { dispatchDockerTool, type DockerMcpManagers } from './dispatch-docker-tool.js';

const DOCKER_MCP_TOOLS: Tool[] = [
  ...getContainerTools(),
  ...getImageTools(),
  ...getNetworkTools(),
  ...getVolumeTools(),
  ...getSystemTools(),
  ...getExecTools(),
  ...getComposeTools(),
  ...getRegistryTools(),
] as Tool[];

class DockerProvider implements Provider {
  readonly id = 'docker';
  readonly displayName = 'Docker';
  private logger = new Logger('DockerProvider');
  private dockerClient = new DockerClient();
  private mcp: DockerMcpManagers;

  constructor() {
    this.mcp = {
      containerManager: new ContainerManager(this.dockerClient),
      imageManager: new ImageManager(this.dockerClient),
      networkManager: new NetworkManager(this.dockerClient),
      volumeManager: new VolumeManager(this.dockerClient),
      systemManager: new SystemManager(this.dockerClient),
      execManager: new ExecManager(this.dockerClient),
      composeManager: new ComposeManager(),
      dockerHubClient: new DockerHubClient(),
      ghcrClient: new GHCRClient(),
    };
  }

  register(registry: ToolRegistry): void {
    registry.register('docker_ping', {
      tool: {
        name: 'docker_ping',
        description:
          'Ping the Docker daemon (dockerode). Use this to verify Docker is reachable before other docker_* tools.',
        inputSchema: { type: 'object', properties: {} },
      },
      handler: async (): Promise<ToolResult> => {
        const ok = await this.dockerClient.testConnection();
        return {
          content: [
            {
              type: 'text' as const,
              text: ok
                ? 'Docker daemon reachable (ping succeeded).'
                : 'Docker daemon unreachable. Start Docker Desktop or the Docker engine, then retry.',
            },
          ],
        };
      },
    });

    for (const tool of DOCKER_MCP_TOOLS) {
      registry.register(tool.name, {
        tool,
        handler: async (args: Record<string, unknown>): Promise<ToolResult> =>
          dispatchDockerTool(tool.name, args, this.mcp),
      });
    }

    this.logger.info(`Registered ${DOCKER_MCP_TOOLS.length + 1} Docker MCP tools`);
  }
}

const dockerProvider: Provider = new DockerProvider();
export default dockerProvider;
