import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { Logger } from '@ttt/utils/logger.js';
import { ExtendScriptExecutor } from '@ttt/providers/adobe/_shared/platform/script-executor.js';

const execAsync = promisify(exec);

/**
 * After Effects macOS executor using JXA + DoScriptFile.
 * AE 2024+ broke AppleScript DoScriptFile, so we use JXA exclusively.
 * Results are written to temp JSON files since AE doesn't return values directly.
 */
export class AfterEffectsMacOSExecutor implements ExtendScriptExecutor {
  private logger: Logger;
  private scriptQueue: Array<() => Promise<unknown>> = [];
  private isProcessing = false;
  private appName: string;

  constructor(appName: string) {
    this.appName = appName;
    this.logger = new Logger(`AfterEffectsMacOSExecutor[${appName}]`);
  }

  setAppName(appName: string): void {
    this.appName = appName;
    this.logger = new Logger(`AfterEffectsMacOSExecutor[${appName}]`);
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

      const jxaCommand = `var ae = Application("${this.appName}"); ae.activate(); ae.doScriptFile("${jsxPath}");`;

      try {
        await execAsync(`osascript -l JavaScript -e '${jxaCommand.replace(/'/g, "'\\''")}'`);
      } catch (error) {
        this.logger.warn('JXA execution returned error (may be normal for AE):', error);
      }

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
      }, 10000);

      child.on('error', (error) => {
        reject(new Error(`Failed to launch ${this.appName}: ${error.message}`));
      });
    });
  }
}
