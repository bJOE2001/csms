import{test,expect}from "@playwright/test";
const id=(n:number)=>`40000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
test("offline checkout survives refresh and a lost-response retry confirms one order",async({page,context})=>{
  const committed=new Map<string,unknown>();let loseResponse=true;
  const session={id:id(1),shop_id:id(2),user_id:id(3),device_id:id(4),shift_id:id(5),expires_at:new Date(Date.now()+3600000).toISOString(),offline_capable:true,founder:true,server_sequence:0,menu:[{variant_id:id(6),product_name:"Test Latte",variant_name:"Regular",category:"Coffee",price_id:id(7),recipe_id:id(8),price_cents:15000}],settings:{name:"Offline fixture",timezone:"Asia/Manila",address:"",receipt_footer:"Thank you",methods:["cash","gcash"],max_discount_bps:2000}};
  await page.route("**/api/pos",async route=>{const req=route.request();if(req.method()==="GET")return route.fulfill({json:{shop_id:id(2),user_id:id(3),role:"founder",data:{cashier_shifts:[{id:id(5),device_id:id(4),cashier_id:id(3),closed_at:null,opened_at:new Date().toISOString()}],pos_devices:[]}}});const body=req.postDataJSON();if(body.action==="open")return route.fulfill({json:{data:session}});if(body.action==="order"){if(!committed.has(body.operation_id))committed.set(body.operation_id,body.payload);if(loseResponse){loseResponse=false;return route.abort("failed");}return route.fulfill({json:{data:{id:body.operation_id,total_cents:15000,change_cents:1000,payment_status:"confirmed"}}});}return route.fulfill({json:{data:{}}});});
  await page.goto("/pos");await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await page.reload({waitUntil:"networkidle"});
  await page.getByRole("button",{name:/Use shift/}).click();await expect(page.getByRole("button",{name:/Test Latte/})).toBeVisible();
  await context.setOffline(true);await page.getByRole("button",{name:/Test Latte/}).click();await page.getByLabel("Cash tendered (PHP)").fill("160");await page.getByRole("button",{name:"Save checkout on device"}).click();await expect(page.getByText(/Order saved on this device/)).toBeVisible();await expect(page.getByText(/#1 .* pending/)).toBeVisible();
  await page.reload({waitUntil:"domcontentloaded"});await expect(page.getByText(/#1 .* pending/)).toBeVisible();await context.setOffline(false);await expect(page.getByText(/#1 .* failed/)).toBeVisible({timeout:20000});
  await page.getByRole("button",{name:"Retry original order"}).click();await expect(page.getByText(/#1 .* synced/)).toBeVisible();expect(committed.size).toBe(1);
  await page.setViewportSize({width:375,height:812});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("POS API requires authentication and account recovery remains available",async({request,page})=>{
  expect((await request.get("/api/pos")).status()).toBe(401);
  await page.goto("/forgot-password");await expect(page.getByRole("heading",{name:"Reset your password"})).toBeVisible();await expect(page.getByLabel("Account email")).toBeVisible();
});

