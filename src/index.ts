#!/usr/bin/env node

import { HuduMcpServer } from './mcp/server.js';
import { Logger } from './utils/logger.js';
import { loadEnvironmentConfig, mergeWithMcpConfig } from './utils/config.js';

async function main() {
  let logger: Logger | undefined;

  try {
    const envConfig = loadEnvironmentConfig();
    const mcpConfig = mergeWithMcpConfig(envConfig);

    logger = new Logger(envConfig.logging.level, envConfig.logging.format);
    logger.info('Starting Hudu MCP Server...');
    logger.debug('Configuration loaded', {
      serverName: mcpConfig.name,
      serverVersion: mcpConfig.version,
      hasCredentials: !!(mcpConfig.hudu.baseUrl && mcpConfig.hudu.apiKey)
    });

    if (mcpConfig.hudu.mode === 'oauth') {
      if (!mcpConfig.hudu.baseUrl) {
        logger.warn('Missing HUDU_BASE_URL. OAuth mode requires it to discover the Hudu instance\'s MCP endpoint.');
      } else {
        logger.info('Hudu auth mode: oauth (proxying to the Hudu instance\'s native MCP server)');
      }
    } else if (!mcpConfig.hudu.baseUrl || !mcpConfig.hudu.apiKey) {
      logger.warn('Missing Hudu credentials. Tools will return errors until HUDU_BASE_URL and HUDU_API_KEY are configured.');
    }

    const server = new HuduMcpServer(mcpConfig, logger, envConfig);

    process.on('SIGINT', async () => {
      logger!.info('Received SIGINT, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger!.info('Received SIGTERM, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    await server.start();
  } catch (error) {
    if (logger) {
      logger.error('Failed to start Hudu MCP Server:', error);
    } else {
      console.error('Failed to start Hudu MCP Server:', error);
    }
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
