import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',testMatch:'**/*.e2e.ts',workers:1,timeout:60000,
  use:{baseURL:'http://127.0.0.1:3001',headless:true,timezoneId:"America/Argentina/Buenos_Aires",trace:'retain-on-failure',screenshot:'only-on-failure'},
  reporter:[['list']],outputDir:'test-results'
});
