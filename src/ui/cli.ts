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
    process.stderr.write(`\n  ${c.yellow}!${c.reset}  No background server found.\n\n`);
    process.exit(1);
  }
  if (!isProcessAlive(state.pid)) {
    try {
      unlinkSync(getBackgroundStatePath());
    } catch {
      /* noop */
    }
    process.stdout.write(`\n  ${c.dim}–${c.reset}  Removed stale state (process was already gone).\n\n`);
    process.exit(0);
  }
  process.stdout.write(`\n  ${c.dim}Stopping TTT UI (PID ${state.pid})…${c.reset}\n`);
  try {
    process.kill(state.pid, 'SIGTERM');
  } catch (err) {
    process.stderr.write(`\n  ${c.yellow}!${c.reset}  Failed to signal PID ${state.pid}: ${(err as Error).message}\n\n`);
    process.exit(1);
  }
  for (let i = 0; i < 50; i++) {
    if (!isProcessAlive(state.pid)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (isProcessAlive(state.pid)) {
    process.stderr.write(`\n  ${c.yellow}!${c.reset}  Process ${state.pid} did not stop in time.\n\n`);
    process.exit(1);
  }
  try {
    unlinkSync(getBackgroundStatePath());
  } catch {
    /* noop */
  }
  process.stdout.write(`\n  ${c.green}${c.bold}✓${c.reset}  TTT UI stopped  ${c.dim}(was ${state.url})${c.reset}\n\n`);
  process.exit(0);
}

// ANSI helpers — gracefully degrade when stdout is not a TTY
const isTTY = process.stdout.isTTY === true;
const c = {
  reset:  isTTY ? '\x1b[0m'  : '',
  bold:   isTTY ? '\x1b[1m'  : '',
  dim:    isTTY ? '\x1b[2m'  : '',
  green:  isTTY ? '\x1b[32m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  cyan:   isTTY ? '\x1b[36m' : '',
  gray:   isTTY ? '\x1b[90m' : '',
};

function spawnDetached(): never {
  mkdirSync(getTttHomeDir(), { recursive: true, mode: 0o700 });
  const existing = readBackgroundStateSync();
  if (existing && isProcessAlive(existing.pid)) {
    process.stderr.write(
      `${c.yellow}!${c.reset} ttt ui is already running (PID ${existing.pid})\n` +
      `  ${c.dim}${existing.url}${c.reset}\n\n` +
      `  Run ${c.bold}ttt ui --stop${c.reset} to stop it.\n\n`
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
  const childArgv = process.argv.slice(2).filter(
    (a) => a !== '--detach' && a !== '-D' && a !== '--stop' && a !== 'ui'
  );
  const child = spawn(process.execPath, [cliPath, ...childArgv], {
    detached: true,
    stdio: 'ignore',
    windowsHide: process.platform === 'win32',
    env: { ...process.env, [BG_CHILD_ENV]: '1' },
  });
  child.unref();

  const statePath = getBackgroundStatePath();
  process.stdout.write(
    `\n  ${c.green}${c.bold}✓${c.reset}  ${c.bold}TTT UI${c.reset}  ${c.dim}started in background${c.reset}\n\n` +
    `  ${c.dim}PID${c.reset}     ${child.pid}\n` +
    `  ${c.dim}State${c.reset}   ${c.cyan}${statePath}${c.reset}\n\n` +
    `  ${c.dim}The URL will be written to state file when ready.${c.reset}\n\n` +
    `  ${c.dim}────────────────────────────────────────────${c.reset}\n\n` +
    `  ${c.bold}ttt ui --stop${c.reset}${c.dim}         Stop the background server${c.reset}\n` +
    `  ${c.bold}ttt ui --help${c.reset}${c.dim}         Show all options${c.reset}\n\n`
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
      printUiHelp();
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      printVersion();
      process.exit(0);
    }
  }
  return flags;
}

export function printUiHelp(): void {
  const row = (flags: string, desc: string) =>
    `  ${c.bold}${flags.padEnd(26)}${c.reset}${c.dim}${desc}${c.reset}\n`;

  process.stdout.write(
    `\n  ${c.bold}ttt ui${c.reset}  ${c.dim}v${PKG_VERSION} — Browser UI for the TTT MCP server${c.reset}\n\n` +
    `  ${c.dim}USAGE${c.reset}\n\n` +
    `  ttt ui ${c.dim}[options]${c.reset}\n\n`  +
    `  ${c.dim}OPTIONS${c.reset}\n\n` +
    row('-p, --port <number>', 'Port to listen on  (default: auto)') +
    row('    --host <host>',   'Bind address       (default: 127.0.0.1)') +
    row('    --no-open',       'Do not open browser automatically') +
    row('-D, --detach',        'Run server in the background') +
    row('    --stop',          'Stop the background server') +
    row('-h, --help',          'Show this help') +
    `\n  ${c.dim}STORAGE${c.reset}\n\n` +
    `  API keys    OS credential store (Keychain on macOS)\n` +
    `  Database    ${c.cyan}~/.ttt/data.db${c.reset}\n` +
    `  BG state    ${c.cyan}~/.ttt/ui-background.json${c.reset}\n\n`
  );
}

function printVersion(): void {
  process.stdout.write(`ttt ${c.bold}${PKG_VERSION}${c.reset}\n`);
}

export async function runUiCli(argv: string[]): Promise<void> {
  const logger = new Logger('UI');
  const flags = parseFlags(argv);

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

  process.stdout.write(
    `\n  ${c.green}${c.bold}✓${c.reset}  ${c.bold}TTT UI${c.reset}  ${c.dim}v${PKG_VERSION}${c.reset}\n\n` +
    `  ${c.dim}URL${c.reset}     ${c.cyan}${c.bold}${url}${c.reset}\n` +
    (isBackgroundChild ? '' :
      `\n  ${c.dim}────────────────────────────────────────────${c.reset}\n\n` +
      `  ${c.bold}^C${c.reset}${c.dim}  to stop${c.reset}\n`) +
    `\n`
  );

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

// Standalone entry — used when spawned directly as a background child process.
if (process.env[BG_CHILD_ENV] === '1') {
  runUiCli(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`Failed to start TTT UI: ${(err as Error).message}\n`);
    process.exit(1);
  });
}
