import { platform } from 'os';
import { Logger } from '@ttt/utils/logger.js';
import { ExtendScriptExecutor } from '@ttt/providers/adobe/_shared/platform/script-executor.js';
import { MacOSExtendScriptExecutor } from '@ttt/providers/adobe/_shared/platform/macos-executor.js';
import { WindowsExtendScriptExecutor } from '@ttt/providers/adobe/_shared/platform/windows-executor.js';
import { PhotoshopDetector } from '@ttt/providers/adobe/photoshop/detector.js';
import type { AdobeAppInfo } from '@ttt/providers/adobe/_shared/detector/base-adobe-detector.js';

/**
 * Manages discovery + script execution against a locally-installed Adobe
 * Photoshop. Auto-launches Photoshop on first script execution if needed.
 */
export class PhotoshopConnection {
  private logger: Logger;
  private detector: PhotoshopDetector;
  private executor!: ExtendScriptExecutor;
  private macosExecutor?: MacOSExtendScriptExecutor;
  private info: AdobeAppInfo | null = null;

  constructor() {
    this.logger = new Logger('PhotoshopConnection');
    this.detector = new PhotoshopDetector();

    const sys = platform();
    if (sys === 'win32') {
      this.executor = new WindowsExtendScriptExecutor({
        comProgId: 'Photoshop.Application',
        exeName: 'Photoshop.exe',
      });
    } else if (sys === 'darwin') {
      // The exact app name (e.g. "Adobe Photoshop 2025") is filled in once
      // detection succeeds — until then we use a sensible default that the
      // detector will overwrite.
      this.macosExecutor = new MacOSExtendScriptExecutor('Adobe Photoshop');
      this.executor = this.macosExecutor;
    } else {
      throw new Error(`Unsupported platform: ${sys}`);
    }
  }

  async ping(): Promise<boolean> {
    try {
      if (!this.info) this.info = await this.detector.detect();
      return this.info !== null;
    } catch (error) {
      this.logger.error('Ping failed:', error);
      return false;
    }
  }

  async getVersion(): Promise<string> {
    if (!this.info) this.info = await this.detector.detect();
    return this.info.version;
  }

  async executeScript(script: string, timeout?: number): Promise<unknown> {
    if (!this.info) this.info = await this.detector.detect();

    if (this.macosExecutor && this.info.appName) {
      this.macosExecutor.setAppName(this.info.appName);
    }

    const isRunning = await this.executor.isAppRunning();
    if (!isRunning) {
      this.logger.info('Photoshop not running, launching...');
      await this.executor.launchApp(this.info.path);
    }

    try {
      return await this.executor.execute(script, timeout);
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7545/ingest/7dec45e0-6a2d-4c4e-aa28-014cad516a1d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f7afd5' },
        body: JSON.stringify({
          sessionId: 'f7afd5',
          hypothesisId: 'H0',
          location: 'connection.ts:executeScript',
          message: 'executeScript_failed',
          data: {
            msg: error instanceof Error ? error.message : String(error),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      throw error;
    }
  }

  getInfo(): AdobeAppInfo | null {
    return this.info;
  }

  async ensureRunning(): Promise<void> {
    if (!this.info) this.info = await this.detector.detect();
    const isRunning = await this.executor.isAppRunning();
    if (!isRunning) {
      this.logger.info('Launching Photoshop...');
      await this.executor.launchApp(this.info.path);
    }
  }
}
