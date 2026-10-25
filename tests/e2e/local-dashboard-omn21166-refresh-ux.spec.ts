import { expect,test } from 'playwright/test';
import { chartRows,prefix,serveCharts } from './omn21166-chart-fixtures';
const quality=prefix+'delegation.quality-gate.v1';
test.use({viewport:{width:1440,height:900},trace:'on'});
// Before implementation: late success remains discarded until next interval;
// raw internal topic is the primary UI; saved values disappear or retry cannot recover.
test('slow quality data recovers immediately after the five-second notice',async({page},info)=>{
 await serveCharts(page);let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 await page.route('**/projection/'+quality,async route=>{await gate;await route.fulfill({contentType:'application/json',body:JSON.stringify({rows:chartRows[quality],row_count:1,data_freshness:'fresh'})});});
 await page.goto('/overview');const panel=page.locator('[data-component="overview-quality"]');
 // OMN-21166 live review 2026-10-25: Quality is the "Delegation Quality" card; its served pass rate (.75) is the figure and its
 // served counts (6 of 8 runs) are in its hover, so those replace the deleted "Checks" detail row.
 await expect(panel.getByText('Quality data is taking longer than expected.',{exact:true})).toBeVisible({timeout:8000});
 const details=panel.locator('details');await expect(details).not.toHaveAttribute('open','');
 await expect(panel.getByText('No answer within 5 seconds.',{exact:false})).toBeHidden();
 await page.screenshot({path:info.outputPath('quality-friendly-slow.png')});release();
 await expect(panel.locator('[role="alert"]')).toHaveCount(0,{timeout:3000});
 await expect(panel.locator('.local-dashboard-metric')).toHaveText('75.0%');
 await page.screenshot({path:info.outputPath('quality-late-recovered.png')});
});
test('failed refresh keeps saved values and supports retry with technical details',async({page},info)=>{
 await serveCharts(page);let fail=false;
 await page.route('**/projection/'+quality,route=>route.fulfill(fail?{status:503,body:'Service unavailable'}:{contentType:'application/json',body:JSON.stringify({rows:chartRows[quality],row_count:1,data_freshness:'fresh'})}));
 await page.goto('/overview');const panel=page.locator('[data-component="overview-quality"]');
 // OMN-21166 live review 2026-10-25: Quality is the "Delegation Quality" card; its served pass rate (.75) is the figure and its
 // served counts (6 of 8 runs) are in its hover, so those replace the deleted "Checks" detail row.
 await expect(panel.locator('.local-dashboard-metric')).toHaveText('75.0%');
 fail=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await expect(panel.getByText('Quality data couldn’t refresh.',{exact:true})).toBeVisible();
 await expect(panel.getByText(/Showing saved data from/)).toBeVisible();
 await expect(panel.locator('.local-dashboard-metric')).toHaveText('75.0%');
 await panel.getByText('Technical details',{exact:true}).click();
 await expect(panel.getByText('The data could not be read (HTTP 503',{exact:false})).toBeVisible();
 fail=false;await panel.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(panel.locator('[role="alert"]')).toHaveCount(0);
 await page.screenshot({path:info.outputPath('quality-retry-recovered.png')});
});
test('connection errors use a clear message and retry restores the page',async({page},info)=>{
 await serveCharts(page);let fail=true;
 await page.route('**/projections',route=>fail?route.fulfill({status:503,body:'Service unavailable'}):route.fallback());
 await page.goto('/overview');
 await expect(page.getByText('Dashboard is unavailable.',{exact:true})).toBeVisible();
 await expect(page.getByText('GET /projections returned HTTP 503',{exact:false})).toBeHidden();
 fail=false;await page.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(page.locator('[data-component="overview-quality"]')).toBeVisible();
 await expect(page.getByText('Dashboard is unavailable.',{exact:true})).toHaveCount(0);
 await page.screenshot({path:info.outputPath('connection-retry.png')});
});
