#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TTTServer } from '@ttt/core/server.js';
import { Logger } from '@ttt/utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

const isTTY = process.stdout.isTTY === true;
const c = {
  reset:  isTTY ? '\x1b[0m'  : '',
  bold:   isTTY ? '\x1b[1m'  : '',
  dim:    isTTY ? '\x1b[2m'  : '',
  cyan:   isTTY ? '\x1b[36m' : '',
};

function printHelp(): void {
  const cmd = (name: string, desc: string) =>
    `  ${c.bold}ttt ${name.padEnd(22)}${c.reset}${c.dim}${desc}${c.reset}\n`;

  process.stdout.write(
    `\n  ${c.bold}ttt${c.reset}  ${c.dim}v${PKG_VERSION} — TTT (The Tortoise Trainer)${c.reset}\n\n` +
    `  ${c.dim}USAGE${c.reset}\n\n` +
    `  ttt ${c.dim}[command]${c.reset}\n\n` +
    `  ${c.dim}COMMANDS${c.reset}\n\n` +
    cmd('',          'Start MCP server (default)') +
    cmd('ui',        'Start browser UI') +
    cmd('ui -D',     'Start browser UI in background') +
    cmd('ui --stop', 'Stop background UI') +
    cmd('ui --help', 'Show UI options') +
    `\n  ${c.dim}FLAGS${c.reset}\n\n` +
    `  ${c.bold}-h, --help${c.reset}${c.dim}               Show this help${c.reset}\n` +
    `  ${c.bold}-v, --version${c.reset}${c.dim}            Print version${c.reset}\n\n` +
    `  ${c.dim}STORAGE${c.reset}\n\n` +
    `  Database    ${c.cyan}~/.ttt/data.db${c.reset}\n` +
    `  API keys    OS credential store (Keychain on macOS)\n\n`
  );
}

function printVersion(): void {
  process.stdout.write(`ttt ${c.bold}${PKG_VERSION}${c.reset}\n`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const first = argv[0];

  if (first === '-h' || first === '--help') {
    printHelp();
    process.exit(0);
  }

  if (first === '-v' || first === '--version') {
    printVersion();
    process.exit(0);
  }

  if (first === 'ui') {
    const { runUiCli } = await import('@ttt/ui/cli.js');
    await runUiCli(argv.slice(1));
    return;
  }

  // Default: MCP server
  const logger = new Logger('Main');
  logger.info('Starting TTT MCP Server...');
  const server = new TTTServer();
  await server.start();
  logger.info('TTT MCP Server is running');
}

main().catch((err) => {
  process.stderr.write(`ttt: ${(err as Error).message}\n`);
  process.exit(1);
});
