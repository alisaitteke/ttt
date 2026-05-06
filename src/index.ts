#!/usr/bin/env node

import { AdobeAgentMCPServer } from './core/server.js';
import { Logger } from './utils/logger.js';

const logger = new Logger('Main');

async function main() {
  try {
    logger.info('Starting Adobe Agent MCP Server...');

    const server = new AdobeAgentMCPServer();
    await server.start();

    logger.info('Adobe Agent MCP Server is running');
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
