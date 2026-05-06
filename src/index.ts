#!/usr/bin/env node

import { TTTServer } from './core/server.js';
import { Logger } from './utils/logger.js';

const logger = new Logger('Main');

async function main() {
  try {
    logger.info('Starting TTT MCP Server...');
    const server = new TTTServer();
    await server.start();
    logger.info('TTT MCP Server is running');
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
