import { platform } from 'os';
import { Logger } from '@ttt/utils/logger.js';
import { ExtendScriptExecutor } from '@ttt/providers/adobe/_shared/platform/script-executor.js';
import { AfterEffectsMacOSExecutor } from '@ttt/providers/adobe/after-effects/macos-executor.js';
import { AfterEffectsWindowsExecutor } from '@ttt/providers/adobe/after-effects/windows-executor.js';
import { AfterEffectsDetector } from '@ttt/providers/adobe/after-effects/detector.js';
import type { AdobeAppInfo } from '@ttt/providers/adobe/_shared/detector/base-adobe-detector.js';

/**
 * Manages discovery + script execution against a locally-installed Adobe
 * After Effects. Auto-launches AE on first script execution if needed.
 */
export class AfterEffectsConnection {
  private logger: Logger;
  private detector: AfterEffectsDetector;
  private executor!: ExtendScriptExecutor;
  private macosExecutor?: AfterEffectsMacOSExecutor;
  private info: AdobeAppInfo | null = null;

  constructor() {
    this.logger = new Logger('AfterEffectsConnection');
    this.detector = new AfterEffectsDetector();

    const sys = platform();
    if (sys === 'win32') {
      this.executor = new AfterEffectsWindowsExecutor({
        exePath: '',
        exeName: 'AfterFX.exe',
      });
    } else if (sys === 'darwin') {
      this.macosExecutor = new AfterEffectsMacOSExecutor('Adobe After Effects');
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
      this.logger.info('After Effects not running, launching...');
      await this.executor.launchApp(this.info.path);
    }

    return await this.executor.execute(script, timeout);
  }

  getInfo(): AdobeAppInfo | null {
    return this.info;
  }

  async ensureRunning(): Promise<void> {
    if (!this.info) this.info = await this.detector.detect();
    const isRunning = await this.executor.isAppRunning();
    if (!isRunning) {
      this.logger.info('Launching After Effects...');
      await this.executor.launchApp(this.info.path);
    }
  }
}
