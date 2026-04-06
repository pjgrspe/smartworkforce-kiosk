/**
 * PM2 Ecosystem Configuration for SmartWorkforce
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
      name: 'apollo-central',
      script: 'index.js',
      cwd: path.join(__dirname, 'server'),
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
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
      name: 'apollo-ai',
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
      interpreter: 'none'
    }
  ]
};
