import {NextResponse,type NextRequest} from "next/server";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {orderPayloadSchema} from "@/lib/pos/domain";
import{isSameOrigin}from "@/lib/http";

export async function GET(){
  const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"Sign in to open POS."},{status:401});
  const{data:membership}=await supabase.from("shop_members").select("shop_id,role").eq("user_id",user.id).eq("status","active").order("created_at").limit(1).maybeSingle();
  if(!membership)return NextResponse.json({error:"An active shop membership is required."},{status:403});
  const{data,error}=await supabase.rpc("get_business_data",{p_shop_id:membership.shop_id,p_module:"pos"});if(error)return NextResponse.json({error:"Apply pending database migrations before opening POS."},{status:503});
  return NextResponse.json({shop_id:membership.shop_id,user_id:user.id,role:membership.role,data},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(request:NextRequest){
  if(!isSameOrigin(request,process.env.APP_URL))return NextResponse.json({error:"Invalid origin"},{status:403});
  if(Number(request.headers.get("content-length"))>131072)return NextResponse.json({error:"Payload too large"},{status:413});
  const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"Sign in again to synchronize. Your queue is retained."},{status:401});
  try{
    const reader=request.body?.getReader();if(!reader)throw new Error("Empty request");
    let size=0;const chunks:Uint8Array[]=[];
    while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>131072){await reader.cancel();return NextResponse.json({error:"Payload too large"},{status:413});}chunks.push(chunk.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const body=z.object({action:z.enum(["open","order","close","pair"]),shop_id:z.uuid(),operation_id:z.uuid().optional(),device_id:z.uuid().optional(),shift_id:z.uuid().optional(),browser_key:z.string().min(32).max(128).optional(),last_sequence:z.number().int().nonnegative().optional(),payload:z.unknown().optional(),recovery_reason:z.string().trim().min(1).max(500).optional(),data:z.record(z.string(),z.union([z.string(),z.number(),z.boolean()])).optional()}).parse(JSON.parse(new TextDecoder().decode(bytes)));
    let response;
    if(body.action==="pair")response=await supabase.rpc("pair_pos_device",{p_shop_id:body.shop_id,p_device_id:z.uuid().parse(body.device_id),p_browser_key:z.string().min(32).max(128).parse(body.browser_key)});
    else if(body.action==="open")response=await supabase.rpc("open_pos_session",{p_shop_id:body.shop_id,p_device_id:z.uuid().parse(body.device_id),p_shift_id:z.uuid().parse(body.shift_id),...(body.browser_key?{p_browser_key:body.browser_key}:{}),...(body.last_sequence!==undefined?{p_last_sequence:body.last_sequence}:{})});
    else if(body.action==="order")response=await supabase.rpc("process_order",{p_shop_id:body.shop_id,p_operation_id:z.uuid().parse(body.operation_id),p_payload:orderPayloadSchema.parse(body.payload),...(body.recovery_reason?{p_recovery_reason:body.recovery_reason}:{})});
    else response=await supabase.rpc("close_cashier_shift",{p_shop_id:body.shop_id,p_operation_id:z.uuid().parse(body.operation_id),p_data:z.record(z.string(),z.union([z.string(),z.number(),z.boolean()])).parse(body.data)});
    if(response.error){console.error("pos_rpc_failed",{action:body.action,code:response.error.code});return NextResponse.json({error:["P0001","42501"].includes(response.error.code)?response.error.message:"Transaction rejected. Check shop records, sequence conflicts and database migrations.",code:response.error.code},{status:422});}
    return NextResponse.json({data:response.data},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return NextResponse.json({error:"Invalid POS input."},{status:400});}
}
