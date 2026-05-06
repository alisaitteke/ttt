import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import { writeFile, unlink, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, basename } from 'path';
import { randomUUID } from 'crypto';
import { Logger } from '@ttt/utils/logger.js';
import { ExtendScriptExecutor } from '@ttt/providers/adobe/_shared/platform/script-executor.js';

const execAsync = promisify(exec);

/**
 * After Effects Windows executor using afterfx.exe -r (run script file).
 * WARNING: Untested by the author - contributions welcome.
 * Uses file-based result IO since AE doesn't return values directly.
 */
export class AfterEffectsWindowsExecutor implements ExtendScriptExecutor {
  private logger: Logger;
  private scriptQueue: Array<() => Promise<unknown>> = [];
  private isProcessing = false;
  private exePath: string;
  private exeName: string;

  constructor(opts: { exePath: string; exeName: string }) {
    this.exePath = opts.exePath;
    this.exeName = opts.exeName;
    this.logger = new Logger(`AfterEffectsWindowsExecutor[${opts.exeName}]`);
  }

  async execute(script: string, timeout: number = 30000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Script execution timeout'));
      }, timeout);

      this.scriptQueue.push(async () => {
        try {
          const result = await this.executeScript(script, timeout);
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

  private async executeScript(script: string, timeout: number): Promise<unknown> {
    const scriptId = randomUUID();
    const jsxPath = join(tmpdir(), `ttt-ae-script-${scriptId}.jsx`);
    const resultPath = join(tmpdir(), `ttt-ae-result-${scriptId}.json`);

    try {
      const wrappedScript = this.wrapScriptWithResultIO(script, resultPath);
      await writeFile(jsxPath, wrappedScript, 'utf8');

      await execAsync(`"${this.exePath}" -r "${jsxPath}"`);

      const result = await this.pollForResult(resultPath, timeout);
      return result;
    } finally {
      await unlink(jsxPath).catch(() => {});
      await unlink(resultPath).catch(() => {});
    }
  }

  private wrapScriptWithResultIO(script: string, resultPath: string): string {
    const escapedPath = resultPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    return `(function() {
  var __resultFile = new File('${escapedPath}');
  __resultFile.encoding = 'UTF-8';
  try {
    var result = (function() {
      ${script}
    })();
    __resultFile.open('w');
    __resultFile.write(JSON.stringify({ ok: true, value: result }));
    __resultFile.close();
  } catch (e) {
    try {
      __resultFile.open('w');
      __resultFile.write(JSON.stringify({
        ok: false,
        error: String(e && e.message ? e.message : e),
        line: e && e.line
      }));
      __resultFile.close();
    } catch (_) {}
  }
})();`;
  }

  private async pollForResult(resultPath: string, timeout: number): Promise<unknown> {
    const startTime = Date.now();
    const pollInterval = 100;

    while (Date.now() - startTime < timeout) {
      try {
        const content = await readFile(resultPath, 'utf8');
        const result = JSON.parse(content);

        if (result.ok === false) {
          throw new Error(result.error || 'Script execution failed');
        }

        return result.value;
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          continue;
        }
        throw error;
      }
    }

    throw new Error(
      'After Effects script timed out. Make sure "Allow Scripts to Write Files and Access Network" ' +
        'is enabled in Preferences > Scripting & Expressions'
    );
  }

  async isAppRunning(): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ${this.exeName}"`);
      return stdout.toLowerCase().includes(this.exeName.toLowerCase());
    } catch {
      return false;
    }
  }

  async launchApp(appPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.info(`Launching ${basename(appPath)}: ${appPath}`);

      const child = spawn(appPath, [], {
        detached: true,
        stdio: 'ignore',
      });

      child.unref();

      setTimeout(() => {
        resolve();
      }, 10000);

      child.on('error', (error) => {
        reject(new Error(`Failed to launch app: ${error.message}`));
      });
    });
  }
}
