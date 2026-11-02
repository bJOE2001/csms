"use server";
import {z} from "zod";
import {createClient as createAdminClient} from "@supabase/supabase-js";
import {createClient} from "@/lib/supabase/server";
import {requireFounder} from "@/lib/auth/require-founder";
import type{ActionState}from "@/lib/menu/action-state";

function appUrl(){const url=new URL(process.env.APP_URL??"http://127.0.0.1:3000");if(url.protocol!=="https:"&&!["127.0.0.1","localhost"].includes(url.hostname))throw new Error("Configure an HTTPS APP_URL.");return url.origin;}
export async function requestPasswordReset(_previous:ActionState,form:FormData):Promise<ActionState>{
  const parsed=z.email().safeParse(form.get("email"));if(!parsed.success)return{status:"error",message:"Enter a valid email."};
  const supabase=await createClient();await supabase.auth.resetPasswordForEmail(parsed.data,{redirectTo:`${appUrl()}/auth/callback?next=/reset-password`});
  return{status:"success",message:"If that account exists, a password recovery email has been requested. Check your inbox."};
}
export async function changePassword(_previous:ActionState,form:FormData):Promise<ActionState>{
  const parsed=z.string().min(12).max(256).safeParse(form.get("password"));if(!parsed.success)return{status:"error",message:"Use a password with at least 12 characters."};
  if(form.get("password")!==form.get("confirm"))return{status:"error",message:"Passwords do not match."};
  const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();if(!user)return{status:"error",message:"Open a valid recovery link or sign in first."};
  const{error}=await supabase.auth.updateUser({password:parsed.data});if(error)return{status:"error",message:"Password could not be updated. Request a fresh recovery link."};
  return{status:"success",message:"Password updated. You can return to your workspace."};
}
export async function inviteMember(_previous:ActionState,form:FormData):Promise<ActionState>{
  const{shop,supabase}=await requireFounder();const parsed=z.object({email:z.email(),role:z.enum(["staff","founder"])}).safeParse(Object.fromEntries(form));if(!parsed.success)return{status:"error",message:"Enter a valid email and role."};
  const{data:token,error}=await supabase.rpc("create_membership_invite",{p_shop_id:shop.id,p_email:parsed.data.email,p_role:parsed.data.role});
  if(error||!token)return{status:"error",message:"Invitation could not be created. Check permissions and migrations."};
  const link=`${appUrl()}/app/accept-invite?token=${token}`;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(key){const admin=createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,key,{auth:{persistSession:false,autoRefreshToken:false}});const{error:sendError}=await admin.auth.admin.inviteUserByEmail(parsed.data.email,{redirectTo:`${appUrl()}/auth/callback?invite=${token}`});if(!sendError)return{status:"success",message:"Invitation email requested. The recipient must verify their email and accept membership."};}
  return{status:"success",message:`Invitation saved. For an existing verified account, share this private acceptance link: ${link}. New accounts require Supabase Auth provisioning or configured server invitation credentials and SMTP.`};
}
export async function acceptInvite(_previous:ActionState,form:FormData):Promise<ActionState>{
  const token=z.uuid().safeParse(form.get("token"));if(!token.success)return{status:"error",message:"Invalid invitation."};
  const supabase=await createClient();const{error}=await supabase.rpc("accept_membership_invite",{p_token:token.data});return error?{status:"error",message:"Invitation expired, already used, or does not match your verified email."}:{status:"success",message:"Membership accepted. Open your workspace."};
}
export async function revokeInvite(_previous:ActionState,form:FormData):Promise<ActionState>{
  const{shop,supabase}=await requireFounder();const id=z.uuid().safeParse(form.get("id"));if(!id.success)return{status:"error",message:"Invalid invitation."};
  const{error}=await supabase.rpc("revoke_membership_invite",{p_shop_id:shop.id,p_id:id.data});return error?{status:"error",message:"Pending invitation could not be revoked."}:{status:"success",message:"Invitation revoked."};
}
