// PM2 process config — run with: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'stockai',
      cwd: './backend',
      script: '../.venv/bin/uvicorn',
      args: 'main:app --host 0.0.0.0 --port 8000',
      interpreter: 'none',
      watch: false,
      autorestart: true,
      restart_delay: 3000,
      env: {
        PYTHONPATH: '.',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
