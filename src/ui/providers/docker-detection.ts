import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Resolve CLI + daemon reachability (respects DOCKER_HOST etc.). */
export async function probeDockerAvailable(timeoutMs = 10_000): Promise<boolean> {
  const sys = platform();
  if (sys !== 'darwin' && sys !== 'win32' && sys !== 'linux') return false;

  try {
    const controller = new AbortController();
    const killTimer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await execFileAsync('docker', ['info', '--format', '{{.ServerVersion}}'], {
        windowsHide: sys === 'win32',
        signal: controller.signal,
        maxBuffer: 1024 * 256,
      });
      return true;
    } finally {
      clearTimeout(killTimer);
    }
  } catch {
    return false;
  }
}
