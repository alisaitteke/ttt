export type DesignToolId =
  | 'photoshop'
  | 'after-effects'
  | 'illustrator'
  | 'figma'
  | 'premiere-pro'
  | 'davinci-resolve'
  | 'docker';

export interface DesignToolInfo {
  id: DesignToolId;
  label: string;
  toolPrefix: string;
  /** When set, MCP tools may use several name prefixes (e.g. Docker Hub / GHCR). */
  toolPrefixes?: readonly string[];
  iconKey: 'ps' | 'ae' | 'ai' | 'figma' | 'pr' | 'davinci' | 'docker';
  available: boolean;
  /** Official product / download page (Adobe apps). */
  installUrl?: string;
  /** Local install detected; omitted when probing does not apply. */
  installed?: boolean;
}

export const DESIGN_TOOLS: Record<DesignToolId, DesignToolInfo> = {
  photoshop: {
    id: 'photoshop',
    label: 'Photoshop',
    toolPrefix: 'photoshop_',
    iconKey: 'ps',
    available: true,
    installUrl: 'https://www.adobe.com/products/photoshop.html',
  },
  'after-effects': {
    id: 'after-effects',
    label: 'After Effects',
    toolPrefix: 'aftereffects_',
    iconKey: 'ae',
    available: true,
    installUrl: 'https://www.adobe.com/products/aftereffects.html',
  },
  illustrator: {
    id: 'illustrator',
    label: 'Illustrator',
    toolPrefix: 'illustrator_',
    iconKey: 'ai',
    available: false,
    installUrl: 'https://www.adobe.com/products/illustrator.html',
  },
  'premiere-pro': {
    id: 'premiere-pro',
    label: 'Premiere Pro',
    toolPrefix: 'premiere_',
    iconKey: 'pr',
    available: false,
    installUrl: 'https://www.adobe.com/products/premiere.html',
  },
  figma: {
    id: 'figma',
    label: 'Figma',
    toolPrefix: 'figma_',
    iconKey: 'figma',
    available: false,
  },
  'davinci-resolve': {
    id: 'davinci-resolve',
    label: 'DaVinci Resolve',
    toolPrefix: 'davinci_',
    iconKey: 'davinci',
    available: false,
  },
  docker: {
    id: 'docker',
    label: 'Docker',
    toolPrefix: 'docker_',
    toolPrefixes: ['docker_', 'dockerhub_', 'ghcr_'],
    iconKey: 'docker',
    available: true,
    installUrl: 'https://www.docker.com/products/docker-desktop/',
  },
};

const KNOWN_TOOL_IDS = new Set<string>(Object.keys(DESIGN_TOOLS));

export function sanitizeDesignToolIds(ids: readonly string[]): DesignToolId[] {
  return ids.filter((id): id is DesignToolId => KNOWN_TOOL_IDS.has(id));
}

export function listDesignTools(): DesignToolInfo[] {
  return Object.values(DESIGN_TOOLS);
}

export function getAvailableDesignTools(): DesignToolInfo[] {
  return listDesignTools().filter((tool) => tool.available);
}

export function getAvailableDesignToolIds(): DesignToolId[] {
  return getAvailableDesignTools().map((tool) => tool.id);
}
