import {defineConfig} from '@playwright/test';
export default defineConfig({
  expect:{timeout:15000},testDir:'./tests/browser',testMatch:'**/*.e2e.ts',workers:1,timeout:60000,
  use:{launchOptions:process.env.CRM_BROWSER_EXECUTABLE?{executablePath:process.env.CRM_BROWSER_EXECUTABLE,args:JSON.parse(process.env.CRM_BROWSER_ARGS??'[]')}:undefined,baseURL:'http://127.0.0.1:3001',headless:true,timezoneId:"America/Argentina/Buenos_Aires",trace:'retain-on-failure',screenshot:'only-on-failure'},
  reporter:[['list']],outputDir:'test-results'
});
