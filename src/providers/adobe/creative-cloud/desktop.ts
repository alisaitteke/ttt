import { exec, execFile, spawn } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { platform } from 'node:os';
import { promisify } from 'node:util';

/**
 * Adobe Creative Cloud **desktop** app detection & launch (macOS / Windows).
 * This is host integration, not an MCP provider — it lives under `providers/adobe`
 * next to Photoshop / AE detectors.
 */

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/** Primary Creative Cloud Desktop bundle id (Intel + Apple Silicon). */
const MAC_CC_BUNDLE_ID = 'com.adobe.acc.AdobeCreativeCloud';

const MAC_CC_APP_PATHS = ['/Applications/Adobe Creative Cloud/Adobe Creative Cloud.app'];

function pathOk(p: string): Promise<boolean> {
  return access(p, constants.F_OK)
    .then(() => true)
    .catch(() => false);
}

async function findMacCreativeCloudApp(): Promise<string | null> {
  const envPath = process.env.ADOBE_CREATIVE_CLOUD_PATH?.trim();
  if (envPath) {
    const candidate = envPath.endsWith('.app')
      ? envPath
      : `${envPath.replace(/\/$/, '')}/Adobe Creative Cloud.app`;
    if (await pathOk(candidate)) return candidate;
  }

  try {
    const { stdout } = await execAsync(
      `mdfind "kMDItemCFBundleIdentifier == '${MAC_CC_BUNDLE_ID}'"`,
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

  for (const p of MAC_CC_APP_PATHS) {
    if (await pathOk(p)) return p;
  }

  return null;
}

async function findWindowsCreativeCloudExe(): Promise<string | null> {
  const envExe = process.env.ADOBE_CREATIVE_CLOUD_EXE?.trim();
  if (envExe && (await pathOk(envExe))) return envExe;

  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const candidates = [
    `${programFiles}\\Adobe\\Adobe Creative Cloud\\ACC\\Creative Cloud.exe`,
    `${programFilesX86}\\Adobe\\Adobe Creative Cloud\\ACC\\Creative Cloud.exe`,
  ];
  for (const c of candidates) {
    if (await pathOk(c)) return c;
  }

  try {
    const { stdout } = await execAsync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Creative Cloud.exe" /ve',
      { windowsHide: true }
    );
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

/** Resolves the CC desktop app bundle path (macOS) or Creative Cloud.exe (Windows). */
export async function findCreativeCloudDesktopPath(): Promise<string | null> {
  const sys = platform();
  if (sys === 'darwin') return findMacCreativeCloudApp();
  if (sys === 'win32') return findWindowsCreativeCloudExe();
  return null;
}

export async function probeCreativeCloudDesktop(): Promise<boolean> {
  const p = await findCreativeCloudDesktopPath();
  return p !== null;
}

export async function launchCreativeCloudDesktop(): Promise<void> {
  const sys = platform();
  const appPath = await findCreativeCloudDesktopPath();
  if (!appPath) {
    throw new Error('Adobe Creative Cloud desktop app not found');
  }

  if (sys === 'darwin') {
    await execFileAsync('open', [appPath], { windowsHide: true });
    return;
  }

  if (sys === 'win32') {
    const child = spawn(appPath, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    return;
  }

  throw new Error(`Creative Cloud launch is not supported on ${sys}`);
}
