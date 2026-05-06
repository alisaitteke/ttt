import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join, basename } from 'path';
import { Logger } from '../../../../utils/logger.js';
import { ExtendScriptExecutor } from './script-executor.js';

const execAsync = promisify(exec);

/**
 * Drives any COM-scriptable Adobe app on Windows by writing the JSX to a
 * temp file and asking the app's COM server to evaluate it via VBScript.
 *
 * The COM ProgID (e.g. "Photoshop.Application", "Illustrator.Application")
 * and the on-disk EXE name (used for `tasklist` checks) are supplied per app.
 */
export class WindowsExtendScriptExecutor implements ExtendScriptExecutor {
  private logger: Logger;
  private scriptQueue: Array<() => Promise<unknown>> = [];
  private isProcessing = false;
  private comProgId: string;
  private exeName: string;

  constructor(opts: { comProgId: string; exeName: string }) {
    this.comProgId = opts.comProgId;
    this.exeName = opts.exeName;
    this.logger = new Logger(`WindowsExtendScriptExecutor[${opts.comProgId}]`);
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

    try {
      await writeFile(tempScriptPath, script, 'utf8');

      const vbsScript = this.createVBSWrapper(tempScriptPath);
      const vbsPath = join(tmpdir(), `ttt-vbs-${Date.now()}.vbs`);

      await writeFile(vbsPath, vbsScript, 'utf8');

      try {
        const { stdout, stderr } = await execAsync(`cscript //nologo "${vbsPath}"`);

        if (stderr) {
          this.logger.warn('Script execution warning:', stderr);
        }

        return this.parseResult(stdout);
      } finally {
        await unlink(vbsPath).catch(() => {});
      }
    } finally {
      await unlink(tempScriptPath).catch(() => {});
    }
  }

  private createVBSWrapper(jsxPath: string): string {
    return `
On Error Resume Next
Dim adobeApp
Set adobeApp = CreateObject("${this.comProgId}")

If Err.Number <> 0 Then
    WScript.Echo "ERROR: Failed to connect to ${this.comProgId} - " & Err.Description
    WScript.Quit 1
End If

Dim result
result = adobeApp.DoJavaScript("$.evalFile('" & Replace("${jsxPath}", "\\", "\\\\") & "');")

If Err.Number <> 0 Then
    WScript.Echo "ERROR: " & Err.Description
    WScript.Quit 1
Else
    WScript.Echo result
End If
`.trim();
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
      }, 5000);

      child.on('error', (error) => {
        reject(new Error(`Failed to launch app: ${error.message}`));
      });
    });
  }
}
