import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Logger } from '@ttt/utils/logger.js';
import { ExtendScriptExecutor } from '@ttt/providers/adobe/_shared/platform/script-executor.js';

const execAsync = promisify(exec);

/**
 * Drives any AppleScript-controllable Adobe app (Photoshop, Illustrator,
 * After Effects, InDesign...) by writing the JSX to a temp file and then
 * asking the target app to `do javascript` on it via osascript.
 */
export class MacOSExtendScriptExecutor implements ExtendScriptExecutor {
  private logger: Logger;
  private scriptQueue: Array<() => Promise<unknown>> = [];
  private isProcessing = false;
  private appName: string;

  constructor(appName: string) {
    this.appName = appName;
    this.logger = new Logger(`MacOSExtendScriptExecutor[${appName}]`);
  }

  setAppName(appName: string): void {
    this.appName = appName;
    this.logger = new Logger(`MacOSExtendScriptExecutor[${appName}]`);
  }

  async execute(script: string, timeout: number = 30000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Script execution timeout'));
      }, timeout);

      this.scriptQueue.push(async () => {
        try {
          const result = await this.executeScript(script);
          clearTimeout(timeoutId);
          resolve(result);
          return result;
        } catch (error) {
          clearTimeout(timeoutId);
          reject(error);
          throw error;
        }
      });

      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing || this.scriptQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.scriptQueue.length > 0) {
      const task = this.scriptQueue.shift();
      if (task) {
        try {
          await task();
        } catch (error) {
          this.logger.error('Script execution failed:', error);
        }
      }
    }

    this.isProcessing = false;
  }

  private async executeScript(script: string): Promise<unknown> {
    const tempScriptPath = join(tmpdir(), `ttt-script-${Date.now()}.jsx`);
    const tempAppleScriptPath = join(tmpdir(), `ttt-applescript-${Date.now()}.scpt`);

    try {
      await writeFile(tempScriptPath, script, 'utf8');

      const appleScript = this.createAppleScriptWrapper(tempScriptPath);
      await writeFile(tempAppleScriptPath, appleScript, 'utf8');

      try {
        const { stdout, stderr } = await execAsync(`osascript "${tempAppleScriptPath}"`);

        if (stderr) {
          this.logger.warn('Script execution warning:', stderr);
        }

        return this.parseResult(stdout);
      } catch (error) {
        this.logger.error('AppleScript execution failed:', error);
        throw error;
      } finally {
        await unlink(tempAppleScriptPath).catch(() => {});
      }
    } finally {
      await unlink(tempScriptPath).catch(() => {});
    }
  }

  private createAppleScriptWrapper(jsxPath: string): string {
    const posixPath = jsxPath.replace(/\\/g, '/');

    return `tell application "${this.appName}"
\tactivate
\tset jsxFile to POSIX file "${posixPath}"
\tdo javascript "$.evalFile(decodeURI('${encodeURI(posixPath)}'))"
end tell`;
  }

  private parseResult(output: string): unknown {
    const trimmed = output.trim();

    if (trimmed.startsWith('ERROR:')) {
      throw new Error(trimmed.substring(6).trim());
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  async isAppRunning(): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`pgrep -f "${this.appName}"`);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  async launchApp(appPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.info(`Launching ${this.appName}: ${appPath}`);

      const child = spawn('open', ['-a', appPath], {
        detached: true,
        stdio: 'ignore',
      });

      child.unref();

      setTimeout(() => {
        resolve();
      }, 5000);

      child.on('error', (error) => {
        reject(new Error(`Failed to launch ${this.appName}: ${error.message}`));
      });
    });
  }
}
