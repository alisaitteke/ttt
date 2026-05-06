import { platform } from 'node:os';
import { probeCreativeCloudDesktop } from '../../providers/adobe/creative-cloud/desktop.js';
import { AfterEffectsDetector } from '../../providers/adobe/after-effects/detector.js';
import { IllustratorDetector } from '../../providers/adobe/illustrator/detector.js';
import { PhotoshopDetector } from '../../providers/adobe/photoshop/detector.js';
import { PremiereProDetector } from '../../providers/adobe/premiere/detector.js';
import {
  type DesignToolId,
  type DesignToolInfo,
  listDesignTools,
} from './design-tools.js';
import { probeDockerAvailable } from './docker-detection.js';
import { probeDaVinciResolveInstalled, probeFigmaDesktopInstalled } from './third-party-design-desktop.js';

type DetectorCtor = new () => { detect(): Promise<unknown> };

const DETECTORS: Partial<Record<DesignToolId, DetectorCtor>> = {
  photoshop: PhotoshopDetector,
  'after-effects': AfterEffectsDetector,
  illustrator: IllustratorDetector,
  'premiere-pro': PremiereProDetector,
};

export interface DesignToolsWithHostStatus {
  tools: DesignToolInfo[];
  creativeCloudDesktopInstalled: boolean;
}

let cached: { at: number; data: DesignToolsWithHostStatus } | null = null;
const CACHE_MS = 45_000;

export async function probeDesignToolInstalled(id: DesignToolId): Promise<boolean | null> {
  const Ctor = DETECTORS[id];
  if (Ctor) {
    const sys = platform();
    if (sys !== 'darwin' && sys !== 'win32') return false;
    try {
      await new Ctor().detect();
      return true;
    } catch {
      return false;
    }
  }
  if (id === 'figma') return probeFigmaDesktopInstalled();
  if (id === 'davinci-resolve') return probeDaVinciResolveInstalled();
  if (id === 'docker') return probeDockerAvailable();
  return null;
}

export async function enrichDesignToolsWithInstallStatus(
  tools: DesignToolInfo[]
): Promise<DesignToolInfo[]> {
  return Promise.all(
    tools.map(async (t) => {
      const installed = await probeDesignToolInstalled(t.id);
      if (installed === null) return { ...t };
      return { ...t, installed };
    })
  );
}

export async function listDesignToolsWithInstallStatus(): Promise<DesignToolsWithHostStatus> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;
  const [tools, creativeCloudDesktopInstalled] = await Promise.all([
    enrichDesignToolsWithInstallStatus(listDesignTools()),
    probeCreativeCloudDesktop(),
  ]);
  const data: DesignToolsWithHostStatus = { tools, creativeCloudDesktopInstalled };
  cached = { at: Date.now(), data };
  return data;
}

/** Default tools for a new chat: MCP-available apps that are installed locally. */
export async function resolveDefaultChatTools(): Promise<DesignToolId[]> {
  const { tools } = await listDesignToolsWithInstallStatus();
  return tools.filter((t) => t.available && t.installed === true).map((t) => t.id);
}
