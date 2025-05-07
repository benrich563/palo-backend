export default {
  apps: [{
    name: 'product-validator',
    script: './scripts/validateProductReferences.js',
    autorestart: false,
    cron_restart: '0 0 * * *',
    watch: false,
    instances: 1,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
