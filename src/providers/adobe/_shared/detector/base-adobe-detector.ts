import { exec } from 'child_process';
import { promisify } from 'util';
import { access, constants, readFile } from 'fs/promises';
import { platform } from 'os';
import { Logger } from '@ttt/utils/logger.js';

const execAsync = promisify(exec);

export interface AdobeAppInfo {
  /** Internal app id (e.g. "photoshop", "illustrator"). */
  app: string;
  /** Detected version string (e.g. "26.0.1" or "2025"). */
  version: string;
  /** Full path to the .app bundle (macOS) or .exe (Windows). */
  path: string;
  /** Human-readable app name used by AppleScript on macOS, e.g. "Adobe Photoshop 2025". */
  appName: string;
  /** Whether the application is currently running. */
  isRunning: boolean;
}

export interface DetectorOptions {
  /** Optional environment variable to honour as an explicit override path. */
  envOverrideVar?: string;
}

/**
 * Base class for detecting locally-installed Adobe Creative Cloud applications.
 *
 * Subclasses describe a single Adobe app (Photoshop, Illustrator, AE, ...) by
 * implementing {@link getAppId}, {@link getMacOSAppNamePrefix},
 * {@link getMacOSBundleId}, {@link getWindowsExeName} and the registry key
 * roots / common install paths to probe.
 */
export abstract class BaseAdobeDetector {
  protected logger: Logger;
  protected envOverrideVar?: string;

  constructor(opts: DetectorOptions = {}) {
    this.envOverrideVar = opts.envOverrideVar;
    this.logger = new Logger(`Detector[${this.getAppId()}]`);
  }

  /** Internal app id, e.g. "photoshop". */
  abstract getAppId(): string;

  /** macOS app bundle name prefix, e.g. "Adobe Photoshop". */
  abstract getMacOSAppNamePrefix(): string;

  /** macOS bundle identifier, e.g. "com.adobe.Photoshop". */
  abstract getMacOSBundleId(): string;

  /** Windows process / executable name, e.g. "Photoshop.exe". */
  abstract getWindowsExeName(): string;

  /** Windows registry roots to query, e.g. "HKLM\\SOFTWARE\\Adobe\\Photoshop". */
  protected getWindowsRegistryRoots(): string[] {
    return [];
  }

  /** Optional list of `Adobe Foo {year}` style folder name prefixes to probe under /Applications or Program Files. */
  protected getInstallFolderPrefixes(): string[] {
    return [this.getMacOSAppNamePrefix()];
  }

  /**
   * Detect the application on the host machine. Throws if not found.
   */
  async detect(): Promise<AdobeAppInfo> {
    const sys = platform();
    this.logger.info(`Detecting on ${sys}...`);

    if (this.envOverrideVar) {
      const envPath = process.env[this.envOverrideVar];
      if (envPath) {
        this.logger.debug(`Using ${this.envOverrideVar}=${envPath}`);
        const info = await (sys === 'win32'
          ? this.checkWindowsPath(envPath)
          : this.checkMacPath(envPath));
        if (info) return info;
      }
    }

    if (sys === 'darwin') {
      const fromSpotlight = await this.detectMacOSWithSpotlight();
      if (fromSpotlight) return fromSpotlight;

      for (const path of this.getMacOSCommonPaths()) {
        const info = await this.checkMacPath(path);
        if (info) return info;
      }
    } else if (sys === 'win32') {
      const fromRegistry = await this.detectFromWindowsRegistry();
      if (fromRegistry) return fromRegistry;

      for (const path of this.getWindowsCommonPaths()) {
        const info = await this.checkWindowsPath(path);
        if (info) return info;
      }
    } else {
      throw new Error(`Unsupported platform: ${sys}`);
    }

    throw new Error(`${this.getMacOSAppNamePrefix()} not found on this system`);
  }

  // -------- macOS helpers ---------------------------------------------------

  protected async detectMacOSWithSpotlight(): Promise<AdobeAppInfo | null> {
    try {
      const { stdout } = await execAsync(
        `mdfind "kMDItemCFBundleIdentifier == ${this.getMacOSBundleId()}"`
      );
      const apps = stdout
        .split('\n')
        .filter((line) => line.trim() && line.endsWith('.app'))
        .sort((a, b) => b.localeCompare(a));

      for (const appPath of apps) {
        const info = await this.checkMacPath(appPath);
        if (info) return info;
      }
    } catch (error) {
      this.logger.debug('Spotlight search failed:', error);
    }
    return null;
  }

  protected getMacOSCommonPaths(): string[] {
    const prefixes = this.getInstallFolderPrefixes();
    const paths: string[] = [];

    for (const prefix of prefixes) {
      for (let year = 2026; year >= 2012; year--) {
        paths.push(
          `/Applications/${prefix} ${year}/${prefix} ${year}.app`,
          `/Applications/${prefix} CC ${year}/${prefix} CC ${year}.app`,
          `/Applications/${prefix} ${year}.app`
        );
      }
      paths.push(
        `/Applications/${prefix} CC/${prefix} CC.app`,
        `/Applications/${prefix}/${prefix}.app`,
        `/Applications/${prefix}.app`
      );
    }

    return paths;
  }

  protected async checkMacPath(path: string): Promise<AdobeAppInfo | null> {
    try {
      const cleanPath = path.trim();
      await access(cleanPath, constants.F_OK);

      const version = await this.extractMacVersion(cleanPath);
      const appName =
        cleanPath.split('/').pop()?.replace('.app', '') ?? this.getMacOSAppNamePrefix();

      this.logger.info(`Found ${this.getAppId()} at: ${cleanPath}`);

      return {
        app: this.getAppId(),
        version,
        path: cleanPath,
        appName,
        isRunning: await this.checkMacRunning(appName),
      };
    } catch {
      return null;
    }
  }

  private async extractMacVersion(appPath: string): Promise<string> {
    const plistPath = `${appPath}/Contents/Info.plist`;
    try {
      await access(plistPath, constants.F_OK);
      try {
        const { stdout } = await execAsync(
          `/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "${plistPath}"`
        );
        if (stdout.trim()) return stdout.trim();
      } catch {
        const content = await readFile(plistPath, 'utf8');
        const m = content.match(
          /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/
        );
        if (m) return m[1];
      }
    } catch {
      // ignore — fall through
    }

    const yearMatch = appPath.match(/(\d{4})/);
    if (yearMatch) return yearMatch[1];
    return 'Unknown';
  }

  protected async checkMacRunning(appName: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`pgrep -f "${appName}"`);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  // -------- Windows helpers -------------------------------------------------

  protected async detectFromWindowsRegistry(): Promise<AdobeAppInfo | null> {
    const roots = this.getWindowsRegistryRoots();
    if (roots.length === 0) return null;

    for (const regPath of roots) {
      try {
        const { stdout } = await execAsync(`reg query "${regPath}" /s`);
        const entries = this.parseRegistryOutput(stdout);
        if (entries.length > 0) {
          const latest = entries.sort((a, b) => b.version.localeCompare(a.version))[0];
          const info = await this.checkWindowsPath(latest.path);
          if (info) return info;
        }
      } catch {
        // try next
      }
    }
    return null;
  }

  protected parseRegistryOutput(output: string): Array<{ version: string; path: string }> {
    const entries: Array<{ version: string; path: string }> = [];
    let currentVersion = '';
    for (const line of output.split('\n')) {
      const versionMatch = line.match(/\\(\d+\.\d+)/);
      if (versionMatch) currentVersion = versionMatch[1];
      const pathMatch = line.match(/ApplicationPath\s+REG_SZ\s+(.+)/);
      if (pathMatch && currentVersion) {
        entries.push({ version: currentVersion, path: pathMatch[1].trim() });
      }
    }
    return entries;
  }

  protected getWindowsCommonPaths(): string[] {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const exeName = this.getWindowsExeName();
    const prefixes = this.getInstallFolderPrefixes();
    const paths: string[] = [];

    for (const prefix of prefixes) {
      for (let year = 2026; year >= 2012; year--) {
        paths.push(
          `${programFiles}\\Adobe\\${prefix} ${year}\\${exeName}`,
          `${programFilesX86}\\Adobe\\${prefix} ${year}\\${exeName}`,
          `${programFiles}\\Adobe\\${prefix} CC ${year}\\${exeName}`,
          `${programFilesX86}\\Adobe\\${prefix} CC ${year}\\${exeName}`
        );
      }
      paths.push(
        `${programFiles}\\Adobe\\${prefix} CC\\${exeName}`,
        `${programFiles}\\Adobe\\${prefix}\\${exeName}`
      );
    }
    return paths;
  }

  protected async checkWindowsPath(path: string): Promise<AdobeAppInfo | null> {
    try {
      let cleanPath = path.trim().replace(/^"|"$/g, '');
      if (!cleanPath.toLowerCase().endsWith('.exe')) {
        cleanPath = `${cleanPath}\\${this.getWindowsExeName()}`;
      }
      await access(cleanPath, constants.F_OK);

      const version = this.extractWindowsVersion(cleanPath);
      const appName = this.getMacOSAppNamePrefix(); // re-used as a generic display name

      this.logger.info(`Found ${this.getAppId()} at: ${cleanPath}`);

      return {
        app: this.getAppId(),
        version,
        path: cleanPath,
        appName,
        isRunning: await this.checkWindowsRunning(),
      };
    } catch {
      return null;
    }
  }

  protected extractWindowsVersion(path: string): string {
    const yearMatch = path.match(/(\d{4})/);
    if (yearMatch) return yearMatch[1];
    const versionMatch = path.match(/(\d+\.\d+)/);
    if (versionMatch) return versionMatch[1];
    return 'Unknown';
  }

  protected async checkWindowsRunning(): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ${this.getWindowsExeName()}"`);
      return stdout.toLowerCase().includes(this.getWindowsExeName().toLowerCase());
    } catch {
      return false;
    }
  }
}
