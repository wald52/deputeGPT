const { defineConfig } = require('playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.js/,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:8000',
    headless: true
  },
  webServer: {
    command: 'python serve_local.py',
    url: 'http://127.0.0.1:8000',
    reuseExistingServer: true,
    timeout: 30000
  }
});
