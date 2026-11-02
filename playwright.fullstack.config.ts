import{defineConfig,devices}from "@playwright/test";
export default defineConfig({testDir:"./tests/fullstack",outputDir:".local/fullstack-results",workers:1,timeout:process.env.PLAYWRIGHT_FULLSTACK_DEV==="1"?300000:180000,expect:{timeout:process.env.PLAYWRIGHT_FULLSTACK_DEV==="1"?30000:5000},use:{baseURL:"http://127.0.0.1:3001",...devices["Desktop Chrome"],channel:process.env.PLAYWRIGHT_CHANNEL,screenshot:"only-on-failure",trace:"retain-on-failure"},webServer:{command:process.env.PLAYWRIGHT_FULLSTACK_DEV==="1"?"npm run dev -- --hostname 127.0.0.1 --port 3001":"npm run start -- --hostname 127.0.0.1 --port 3001",url:"http://127.0.0.1:3001",reuseExistingServer:false,stdout:"pipe",timeout:120000}});


