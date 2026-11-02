// TEST ONLY: Supabase Auth/REST contract adapter over a disposable PostgreSQL DB.
// It is never imported by application code or deployed as an application route.
import http from "node:http";
import {spawn} from "node:child_process";
import path from "node:path";

const db=process.env.CSMS_TEST_DB;
if(!db?.startsWith("csms_test_")||!process.env.CSMS_TEST_PG_BIN)throw new Error("Disposable test database required");
const userId="50000000-0000-4000-8000-000000000001";
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
async function sql(query,authenticated=true){return new Promise((resolve,reject)=>{const child=spawn(path.join(process.env.CSMS_TEST_PG_BIN,"psql.exe"),["-X","-qAt","-h","127.0.0.1","-p",process.env.CSMS_TEST_PG_PORT,"-U","csms_test","-d",db,"-v","ON_ERROR_STOP=1"],{windowsHide:true});let output="",error="";child.stdout.on("data",b=>output+=b);child.stderr.on("data",b=>error+=b);child.on("error",reject);child.on("close",code=>{if(code)reject(new Error(error));else{const lines=output.trim().split(/\r?\n/);try{resolve(JSON.parse(lines.at(-1)||"null"));}catch{reject(new Error("Invalid SQL fixture response"));}}});child.stdin.end(`begin;${authenticated?`set local role authenticated;set local request.jwt.claim.sub=${literal(userId)};`:""}${query};commit;`);});}
const functions=new Set(["get_business_data","workspace_dashboard","business_report","manage_inventory","manage_finance","manage_settings","open_pos_session","pair_pos_device","process_order","manage_order","close_cashier_shift","review_cashier_shift","create_menu_category","create_menu_product","add_menu_variant","publish_product_price","create_ingredient","revise_ingredient_estimate","publish_recipe","set_variant_available","create_membership_invite","revoke_membership_invite"]);
const tables=new Set(["shop_members","shops","profiles","categories","products","product_variants","product_prices","recipes","recipe_items","ingredients","pos_devices"]);
const identifier=s=>{if(!/^[a-z_]+$/.test(s))throw new Error("Invalid identifier");return `"${s}"`;};
const argument=value=>value===null?"null":typeof value==="object"?`${literal(JSON.stringify(value))}::jsonb`:typeof value==="boolean"?String(value):typeof value==="number"&&Number.isFinite(value)?String(value):literal(value);
const server=http.createServer(async(req,res)=>{const started=Date.now();const routeName=new URL(req.url,"http://127.0.0.1").pathname;process.stdout.write(`${req.method} ${routeName} started\n`);res.on("finish",()=>process.stdout.write(`${req.method} ${routeName} ${res.statusCode} ${Date.now()-started}ms\n`));const send=(status,data)=>{res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(data));};try{
  const url=new URL(req.url,"http://127.0.0.1:55486");
  if(url.pathname==="/__session"){
    const now=Math.floor(Date.now()/1000);const encode=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
    const token=`${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:userId,role:"authenticated",aud:"authenticated",iat:now,exp:now+3600})}.fixture`;
    return send(200,{name:"sb-127-auth-token",value:`base64-${encode({access_token:token,refresh_token:"fixture-refresh-token",token_type:"bearer",expires_in:3600,expires_at:now+3600,user:{id:userId,email:"browser-founder@example.test",aud:"authenticated",role:"authenticated"}})}`});
  }
  if(url.pathname==="/auth/v1/user")return send(200,{id:userId,email:"browser-founder@example.test",email_confirmed_at:new Date().toISOString(),aud:"authenticated",role:"authenticated",app_metadata:{provider:"email"},user_metadata:{},identities:[],created_at:new Date().toISOString()});
  if(url.pathname.startsWith("/rest/v1/rpc/")&&req.method==="POST"){
    const name=url.pathname.split("/").at(-1);if(!functions.has(name))return send(404,{message:"Unknown fixture RPC"});
    let body="";for await(const chunk of req){body+=chunk;if(body.length>150000)throw new Error("Fixture input too large");}
    const args=Object.entries(JSON.parse(body)).map(([k,v])=>`${identifier(k)}=>${argument(v)}`).join(",");
    return send(200,await sql(`select to_jsonb(public.${identifier(name)}(${args}))`));
  }
  if(url.pathname.startsWith("/rest/v1/")&&req.method==="GET"){
    const table=url.pathname.split("/").at(-1);if(!tables.has(table))return send(404,{message:"Unknown fixture table"});
    const filter=[];for(const[k,v]of url.searchParams){if(["select","order","limit","offset"].includes(k))continue;if(!v.startsWith("eq."))throw new Error("Unsupported fixture filter");filter.push(`r.${identifier(k)}=${literal(v.slice(3))}`);}
    const select=url.searchParams.get("select")??"*";let projection="to_jsonb(r)";
    if(table==="shop_members"&&select.includes("shops("))projection+="||jsonb_build_object('shops',(select to_jsonb(s) from public.shops s where s.id=r.shop_id))";
    for(const match of select.matchAll(/([a-z_]+)::text/g))projection+=`||jsonb_build_object(${literal(match[1])},r.${identifier(match[1])}::text)`;
    const order=(url.searchParams.get("order")??"id.asc").split(",").map(v=>{const[col,direction]=v.split(".");return `r.${identifier(col)} ${direction==="desc"?"desc":"asc"}`;}).join(",");
    const limit=Math.min(1000,Math.max(1,Number(url.searchParams.get("limit"))||1000));
    const records=await sql(`select coalesce(jsonb_agg(x.row),'[]'::jsonb) from(select ${projection} row from public.${identifier(table)} r ${filter.length?`where ${filter.join(" and ")}`:""} order by ${order} limit ${limit}) x`);
    return send(200,req.headers.accept?.includes("vnd.pgrst.object")?(records[0]??null):records);
  }
  send(404,{message:"Unknown fixture endpoint"});
}catch(error){const match=String(error.message).match(/ERROR:\s+([^\r\n]+)/);send(400,{code:"P0001",message:match?.[1]??"Fixture request failed"});}});
server.listen(55486,"127.0.0.1",()=>process.stdout.write("Ready: isolated Supabase contract fixture\n"));
