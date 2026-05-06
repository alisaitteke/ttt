import { exec } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { platform } from 'node:os';
import { promisify } from 'node:util';

/**
 * Detect Figma Desktop and DaVinci Resolve installs (macOS / Windows).
 * Env overrides: FIGMA_DESKTOP_APP (macOS .app or Windows .exe), DAVINCI_RESOLVE_APP.
 */

const execAsync = promisify(exec);

function pathOk(p: string): Promise<boolean> {
  return access(p, constants.F_OK)
    .then(() => true)
    .catch(() => false);
}

const MAC_FIGMA_BUNDLE_ID = 'com.figma.Desktop';
const MAC_FIGMA_PATHS = ['/Applications/Figma.app'];

const MAC_DAVINCI_PATHS = [
  '/Applications/DaVinci Resolve/DaVinci Resolve.app',
  '/Applications/DaVinci Resolve.app',
];

async function findMacAppByBundleId(bundleId: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      `mdfind "kMDItemCFBundleIdentifier == '${bundleId}'"`,
      { maxBuffer: 1024 * 1024 }
    );
    const apps = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.endsWith('.app'))
      .sort((a, b) => b.localeCompare(a));
    for (const appPath of apps) {
      if (await pathOk(appPath)) return appPath;
    }
  } catch {
    // ignore
  }
  return null;
}

async function findWindowsExeViaAppPaths(exeName: string): Promise<string | null> {
  const key = `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`;
  try {
    const { stdout } = await execAsync(`reg query "${key}" /ve`, { windowsHide: true });
    const m = stdout.match(/REG_SZ\s+(.+)/i);
    if (m) {
      const regPath = m[1].trim();
      if (await pathOk(regPath)) return regPath;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function probeFigmaDesktopInstalled(): Promise<boolean> {
  const sys = platform();
  if (sys !== 'darwin' && sys !== 'win32') return false;

  if (sys === 'darwin') {
    const envPath = process.env.FIGMA_DESKTOP_APP?.trim();
    if (envPath && (await pathOk(envPath))) return true;
    if (await findMacAppByBundleId(MAC_FIGMA_BUNDLE_ID)) return true;
    for (const p of MAC_FIGMA_PATHS) {
      if (await pathOk(p)) return true;
    }
    return false;
  }

  const envExe = process.env.FIGMA_DESKTOP_APP?.trim();
  if (envExe && (await pathOk(envExe))) return true;

  const localAppData = process.env.LOCALAPPDATA ?? '';
  const pf = process.env.ProgramFiles ?? 'C:\\Program Files';
  const candidates = [`${localAppData}\\Figma\\Figma.exe`, `${pf}\\Figma\\Figma.exe`];
  for (const c of candidates) {
    if (c && (await pathOk(c))) return true;
  }

  return (await findWindowsExeViaAppPaths('Figma.exe')) !== null;
}

export async function probeDaVinciResolveInstalled(): Promise<boolean> {
  const sys = platform();
  if (sys !== 'darwin' && sys !== 'win32') return false;

  if (sys === 'darwin') {
    const envPath = process.env.DAVINCI_RESOLVE_APP?.trim();
    if (envPath && (await pathOk(envPath))) return true;
    for (const p of MAC_DAVINCI_PATHS) {
      if (await pathOk(p)) return true;
    }
    return false;
  }

  const envExe = process.env.DAVINCI_RESOLVE_APP?.trim();
  if (envExe && (await pathOk(envExe))) return true;

  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const candidates = [
    `${programFiles}\\Blackmagic Design\\DaVinci Resolve\\Resolve.exe`,
    `${programFilesX86}\\Blackmagic Design\\DaVinci Resolve\\Resolve.exe`,
  ];
  for (const c of candidates) {
    if (await pathOk(c)) return true;
  }

  return (await findWindowsExeViaAppPaths('Resolve.exe')) !== null;
}
