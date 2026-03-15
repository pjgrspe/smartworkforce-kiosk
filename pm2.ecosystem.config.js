/**
 * PM2 Ecosystem Configuration for DE WEBNET Facial Recognition System
 *
 * This configuration manages three services:
 * 1. de-webnet-server: Node.js WebSocket server and middleware
 * 2. de-webnet-ai: Python facial recognition engine
 * 3. de-webnet-web: React web application (Vite)
 *
 * Usage:
 *   pm2 start pm2.ecosystem.config.js
 *   pm2 save
 *   pm2 startup (for auto-start on boot)
 */

const path = require('path');

module.exports = {
  apps: [
    {
      name: 'de-webnet-server',
      script: 'index.js',
      cwd: path.join(__dirname, 'server'),
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        WS_PORT: 8080,
        WS_HOST: 'localhost'
      },
      error_file: path.join(__dirname, 'logs', 'server-error.log'),
      out_file: path.join(__dirname, 'logs', 'server-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000
    },
    {
      name: 'de-webnet-ai',
      // Cross-platform: Windows uses Scripts/python.exe, Linux uses bin/python
      script: process.platform === 'win32'
        ? path.join(__dirname, 'ai', 'venv', 'Scripts', 'python.exe')
        : path.join(__dirname, 'ai', 'venv', 'bin', 'python'),
      args: path.join(__dirname, 'ai', 'main.py'),
      cwd: path.join(__dirname, 'ai'),
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8'
      },
      error_file: path.join(__dirname, 'logs', 'ai-error.log'),
      out_file: path.join(__dirname, 'logs', 'ai-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      // Interpreter is set to 'none' because we're calling python directly
      interpreter: 'none'
    },
    {
      name: 'de-webnet-web',
      script: path.join(__dirname, 'web', 'node_modules', '.bin', 'vite'),
      args: 'preview --port 5173 --host',
      cwd: path.join(__dirname, 'web'),
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: path.join(__dirname, 'logs', 'web-error.log'),
      out_file: path.join(__dirname, 'logs', 'web-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000
    }
  ]
};
