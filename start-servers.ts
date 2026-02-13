#!/usr/bin/env bun

/**
 * Dual Server Startup Script
 * Runs both main app (port 3000) and streaming server (port 4444)
 */

import { spawn } from 'child_process';
import { join } from 'path';

console.log(`
╔══════════════════════════════════════════╗
║     Starting Dual Server Setup          ║
║     Main App: http://localhost:3000     ║
║     Streaming: http://localhost:4444    ║
╚══════════════════════════════════════════╝
`);

// Start main app
console.log('🚀 Starting main app on port 3000...');
const mainApp = spawn('bun', ['src/app.ts'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: '3000' },
});

// Start streaming server
console.log('🎯 Starting streaming server on port 4444...');
const streamingServer = spawn('bun', ['test-isolated-server.ts'], {
  stdio: 'inherit',
});

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down servers...');
  mainApp.kill();
  streamingServer.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  mainApp.kill();
  streamingServer.kill();
  process.exit(0);
});

// Handle errors
mainApp.on('error', (err) => {
  console.error('❌ Main app error:', err);
});

streamingServer.on('error', (err) => {
  console.error('❌ Streaming server error:', err);
});

// Handle exits
mainApp.on('exit', (code) => {
  console.log(`Main app exited with code ${code}`);
  streamingServer.kill();
  process.exit(code || 0);
});

streamingServer.on('exit', (code) => {
  console.log(`Streaming server exited with code ${code}`);
  mainApp.kill();
  process.exit(code || 0);
});

console.log(`
✅ Both servers started!

📡 Main API:     http://localhost:3000/api
🎯 Streaming:    http://localhost:4444/test-stream

Press Ctrl+C to stop both servers
`);
