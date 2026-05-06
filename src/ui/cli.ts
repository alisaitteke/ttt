#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import getPort from 'get-port';
import open from 'open';
import { getTttHomeDir } from '@ttt/lib/ttt-paths.js';
import { startUIServer } from '@ttt/ui/server.js';
import { Logger } from '@ttt/utils/logger.js';

const BG_CHILD_ENV = 'TTT_UI_BACKGROUND_CHILD';
const BG_STATE_FILE = 'ui-background.json';

interface BackgroundState {
  pid: number;
  url: string;
  port: number;
  host: string;
  startedAt: string;
}

interface CliFlags {
  port?: number;
  host: string;
  noOpen: boolean;
  detach: boolean;
  stop: boolean;
}

function getBackgroundStatePath(): string {
  return join(getTttHomeDir(), BG_STATE_FILE);
}

function readBackgroundStateSync(): BackgroundState | null {
  try {
    const raw = readFileSync(getBackgroundStatePath(), 'utf8');
    const j = JSON.parse(raw) as Partial<BackgroundState>;
    if (typeof j.pid !== 'number' || typeof j.url !== 'string') return null;
    if (typeof j.port !== 'number' || typeof j.host !== 'string') return null;
    if (typeof j.startedAt !== 'string') return null;
    return j as BackgroundState;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopBackgroundDaemon(): Promise<never> {
  const state = readBackgroundStateSync();
  if (!state) {
    process.stderr.write('ttt-ui: no background daemon state found.\n');
    process.exit(1);
  }
  if (!isProcessAlive(state.pid)) {
    try {
      unlinkSync(getBackgroundStatePath());
    } catch {
      /* noop */
    }
    process.stdout.write('ttt-ui: removed stale daemon state.\n');
    process.exit(0);
  }
  try {
    process.kill(state.pid, 'SIGTERM');
  } catch (err) {
    process.stderr.write(`ttt-ui: failed to signal PID ${state.pid}: ${(err as Error).message}\n`);
    process.exit(1);
  }
  for (let i = 0; i < 50; i++) {
    if (!isProcessAlive(state.pid)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (isProcessAlive(state.pid)) {
    process.stderr.write(`ttt-ui: process ${state.pid} still running.\n`);
    process.exit(1);
  }
  try {
    unlinkSync(getBackgroundStatePath());
  } catch {
    /* noop */
  }
  process.stdout.write(`ttt-ui: stopped (was ${state.url}).\n`);
  process.exit(0);
}

function spawnDetached(): never {
  mkdirSync(getTttHomeDir(), { recursive: true, mode: 0o700 });
  const existing = readBackgroundStateSync();
  if (existing && isProcessAlive(existing.pid)) {
    process.stderr.write(
      `ttt-ui: daemon already running (PID ${existing.pid}, ${existing.url}). Use --stop.\n`
    );
    process.exit(1);
  }
  if (existing && !isProcessAlive(existing.pid)) {
    try {
      unlinkSync(getBackgroundStatePath());
    } catch {
      /* noop */
    }
  }

  const cliPath = fileURLToPath(import.meta.url);
  const childArgv = process.argv.slice(2).filter((a) => a !== '--detach' && a !== '-D' && a !== '--stop');
  const child = spawn(process.execPath, [cliPath, ...childArgv], {
    detached: true,
    stdio: 'ignore',
    windowsHide: process.platform === 'win32',
    env: { ...process.env, [BG_CHILD_ENV]: '1' },
  });
  child.unref();

  process.stdout.write(
    [
      `TTT UI detached (child PID ${child.pid}).`,
      `State (URL appears when ready): ${getBackgroundStatePath()}`,
      'Stop: ttt-ui --stop',
      '',
    ].join('\n')
  );
  process.exit(0);
}

async function writeBackgroundState(state: BackgroundState): Promise<void> {
  await writeFile(getBackgroundStatePath(), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

async function removeBackgroundStateIfOwn(): Promise<void> {
  try {
    const s = readBackgroundStateSync();
    if (s?.pid === process.pid) {
      unlinkSync(getBackgroundStatePath());
    }
  } catch {
    /* noop */
  }
}

// dist/ui/cli.js -> ../../package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { host: '127.0.0.1', noOpen: false, detach: false, stop: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' || arg === '-p') {
      const val = Number(argv[++i]);
      if (Number.isFinite(val) && val > 0) flags.port = val;
    } else if (arg === '--host') {
      flags.host = argv[++i] ?? flags.host;
    } else if (arg === '--no-open') {
      flags.noOpen = true;
    } else if (arg === '--detach' || arg === '-D') {
      flags.detach = true;
    } else if (arg === '--stop') {
      flags.stop = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      printVersion();
      process.exit(0);
    }
  }
  return flags;
}

function printHelp(): void {
  process.stdout.write(
    [
      'ttt-ui — Browser UI for the TTT (The Tortoise Trainer) MCP server',
      '',
      'Usage: ttt-ui [options]',
      '',
      'Options:',
      '  -p, --port <number>   Port to listen on (default: random free port)',
      '      --host <host>     Host to bind to (default: 127.0.0.1)',
      '      --no-open         Do not auto-open the browser',
      '  -D, --detach          Run in background (state: ui-background.json under TTT_HOME; optional --port)',
      '      --stop            Stop the detached UI process (same TTT_HOME as the daemon)',
      '  -h, --help            Show this help',
      '  -v, --version         Show version',
      '',
      'API keys: OS credential store. Chat/settings: ~/.ttt/data.db.',
      '',
    ].join('\n')
  );
}

function printVersion(): void {
  process.stdout.write(`ttt-ui ${PKG_VERSION}\n`);
}

async function main(): Promise<void> {
  const logger = new Logger('UI');
  const flags = parseFlags(process.argv.slice(2));

  if (flags.stop) {
    await stopBackgroundDaemon();
  }

  const isBackgroundChild = process.env[BG_CHILD_ENV] === '1';
  if (flags.detach && !isBackgroundChild) {
    spawnDetached();
  }

  const port = flags.port ?? (await getPort({ port: [5174, 5175, 5176, 5180] }));

  const server = await startUIServer({
    host: flags.host,
    port,
  });

  const url = server.url;

  if (isBackgroundChild) {
    mkdirSync(getTttHomeDir(), { recursive: true, mode: 0o700 });
    await writeBackgroundState({
      pid: process.pid,
      url,
      port,
      host: flags.host,
      startedAt: new Date().toISOString(),
    });
  }

  process.stdout.write(`\nTTT UI ready at:\n  ${url}\n\n`);

  if (!flags.noOpen) {
    try {
      await open(url);
    } catch (err) {
      logger.warn('Failed to auto-open browser', err);
    }
  }

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down`);
    if (isBackgroundChild) {
      await removeBackgroundStateIfOwn();
    }
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  process.stderr.write(`Failed to start TTT UI: ${(err as Error).message}\n`);
  process.exit(1);
});
