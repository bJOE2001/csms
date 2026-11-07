import {test,expect,type Page} from '@playwright/test';
const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function setup(page:Page,empty=false,tracked=false){
 const item={id:uid(1),name:'Ground Coffee',item_type:'ingredient',base_unit:'g',minimum_stock:'100',quantity:'2000',value_cents:120000,unit_cost_cents:'60',notes:'',active:true,revision:1,has_movements:true};
 const calls: {action:string;data:Record<string,unknown>}[]=[];
 await page.route('**/api/inventory*',route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{data:{items:empty?[]:[item],movements:[],configs:[],returnable:[]}}});
  calls.push(route.request().postDataJSON());return route.fulfill({json:{data:{}}});
 });
 await page.route('**/api/pos',route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{shop:{id:uid(9),name:'LOGO'},founder:true,user_id:uid(9),categories:[],products:[{id:uid(2),name:'Cafe Latte',price_cents:12000,cost_cents:5000,active:true,sizes:[],...(tracked?{inventory:{regular:{state:'active',max_quantity:100,cost_cents:6000}}}:{})}]}});
  const body=route.request().postDataJSON();calls.push(body);return route.fulfill({json:{data:{id:body.data.id,total_cents:body.data.items?.reduce((sum:number,item:{price_cents:number;quantity:number})=>sum+item.price_cents*item.quantity,0)}}});
 });return calls;
}
for(const viewport of [{width:1440,height:900},{width:1280,height:800},{width:1032,height:1376},{width:768,height:1024},{width:393,height:852}]){
 test(`simplified Inventory and item details at ${viewport.width}`,async({page})=>{
  await page.setViewportSize(viewport);await setup(page);await page.goto('/app/inventory');
  const nav=page.getByRole('navigation',{name:'Inventory views'});
  await expect(nav.getByRole('button')).toHaveCount(2);
  await expect(nav.getByRole('button',{name:'Stock Items',exact:true})).toBeVisible();
  await expect(nav.getByRole('button',{name:'History',exact:true})).toBeVisible();
  await expect(page.getByText('Inventory Setup',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Stock actions',{exact:true})).toHaveCount(0);
  const row=page.getByRole('row',{name:'Open Ground Coffee details'});await row.focus();await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog',{name:'Ground Coffee',exact:true});await expect(dialog).toContainText('2,000 g');
  await expect(dialog.getByRole('button',{name:'Count Stock',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`.local/ui-review/inventory/final-${viewport.width}.png`,animations:'disabled'});
 });
}
test('initial stock is optional and submitted with item creation',async({page})=>{
 const calls=await setup(page,true);await page.goto('/app/inventory');await page.getByRole('button',{name:'Add Item',exact:true}).click();
 await page.getByLabel('Item name',{exact:true}).fill('Ground Coffee');await page.getByText('Initial Stock',{exact:true}).click();
 await page.getByLabel('Initial Quantity',{exact:true}).fill('2000');await page.getByLabel('Total Initial Stock Value (PHP)',{exact:true}).fill('1200');
 await page.getByRole('button',{name:'Save item',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(calls[0].data.initial_stock).toMatchObject({quantity:'2000',total_cost_cents:120000});
});
test('product creation omits manual costs and unconfigured POS products cannot sell',async({page})=>{
 const calls=await setup(page);await page.goto('/app/menu');await page.getByRole('button',{name:'Add product',exact:true}).click();
 await expect(page.getByLabel(/Manual Estimated Cost/)).toHaveCount(0);
 await page.getByLabel('Product name',{exact:true}).fill('Cappuccino');await page.getByLabel('Selling price (PHP)',{exact:true}).fill('120');
 await page.getByRole('button',{name:'Save product',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(calls.find(call=>call.action==='product')?.data).not.toHaveProperty('cost_cents');
 await page.goto('/pos');await expect(page.getByRole('article',{name:'Cafe Latte',exact:true})).toContainText('Inventory recipe required');
 await expect(page.getByRole('button',{name:/Add to cart/})).toBeDisabled();
});

for(const method of ['Cash','E-wallet']) test(`active recipe preserves ${method} checkout`,async({page})=>{
 const calls=await setup(page,false,true);await page.goto('/pos');
 await page.getByRole('button',{name:/Add to cart/}).click();
 await page.getByRole('button',{name:method,exact:true}).click();
 await page.getByRole('button',{name:'Place an order',exact:true}).click();
 await expect(page.locator('[data-sonner-toast][data-type=success]')).toContainText('Sale completed');
 const checkout=calls.find(call=>call.action==='checkout')!;
 expect(checkout.data.method).toBe(method==='Cash'?'cash':'gcash');
 expect(checkout.data.items).toEqual([{product_id:uid(2),quantity:1,price_cents:12000}]);
});
