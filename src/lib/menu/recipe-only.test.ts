import {expect,it} from 'vitest';
import {inventoryAvailable,productWriteSchema,type Product} from './domain';
const id='00000000-0000-4000-8000-000000000001';
it('requires active stock-backed recipes, including genuinely zero-cost recipes',()=>{
 const product:Product={id,name:'Latte',price_cents:12000,active:true};
 expect(inventoryAvailable(product)).toBe(false);
 expect(inventoryAvailable({...product,inventory:{regular:{state:'draft',max_quantity:100}}})).toBe(false);
 expect(inventoryAvailable({...product,inventory:{regular:{state:'active',max_quantity:10,cost_cents:0}}})).toBe(true);
 expect(inventoryAvailable({...product,inventory:{regular:{state:'active',max_quantity:0,cost_cents:1000}}})).toBe(false);
});
it('rejects manual product and size costs at the write boundary',()=>{
 const product={id,name:'Latte',price_cents:12000,active:true};
 expect(productWriteSchema.safeParse(product).success).toBe(true);
 expect(productWriteSchema.safeParse({...product,cost_cents:0}).success).toBe(false);
 const size={id,label:'12 oz',price_cents:12000,active:true,is_default:true};
 expect(productWriteSchema.safeParse({...product,sizes:[size]}).success).toBe(true);
 expect(productWriteSchema.safeParse({...product,sizes:[{...size,cost_cents:0}]}).success).toBe(false);
 expect(productWriteSchema.safeParse({...product,sizes:[size,size]}).success).toBe(false);
});
