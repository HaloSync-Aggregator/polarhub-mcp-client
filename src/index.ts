/**
 * PolarHub Demo Server
 * Entry point — unified server (Frontend + LLM + MCP orchestration)
 *
 * Dev mode: Vite middleware for HMR
 * Prod mode: Express static serving from frontend/dist/
 */

import { config, validateConfig } from './config/index.js';
import { orchestrator } from './orchestrator/index.js';
import { wsHandler } from './server/websocket.js';
import { createHttpServer } from './server/http-server.js';

const isDev = process.env.NODE_ENV !== 'production';

async function main(): Promise<void> {
  console.log('====================================');
  console.log('  PolarHub Demo Server');
  console.log('====================================');
  console.log('');

  // Validate configuration
  validateConfig();

  console.log('Configuration:');
  console.log(`  LLM Provider: ${config.llm.provider}`);
  console.log(`  Port: ${config.server.port}`);
  console.log(`  MCP Server: ${config.mcp.serverUrl}`);
  console.log(`  Mode: ${isDev ? 'development' : 'production'}`);
  console.log('');

  try {
    // Initialize orchestrator (connects to MCP) — retry for concurrently startup race
    console.log('Initializing orchestrator...');
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await orchestrator.initialize();
        break;
      } catch (err) {
        if (attempt === 5) throw err;
        console.log(`MCP connection attempt ${attempt}/5 failed, retrying in 3s...`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    // Create unified HTTP server (Express + Vite/static)
    console.log('Creating HTTP server...');
    const httpServer = await createHttpServer(isDev);

    // Attach WebSocket handler to HTTP server
    await wsHandler.attachToServer(httpServer);

    httpServer.listen(config.server.port, () => {
      console.log('');
      console.log('====================================');
      console.log('  Server is ready!');
      console.log(`  http://localhost:${config.server.port}`);
      console.log(`  WebSocket: ws://localhost:${config.server.port}/ws`);
      console.log(`  Mode: ${isDev ? 'development (Vite HMR)' : 'production (static)'}`);
      console.log('====================================');
      console.log('');
    });

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log('\nShutting down...');
      await wsHandler.stop();
      await orchestrator.shutdown();
      httpServer.close(() => {
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch(console.error);
