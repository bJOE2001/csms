import { NextResponse,type NextRequest } from "next/server";
import { requireFounder } from "@/lib/auth/require-founder";

export async function GET(request:NextRequest) {
  const {supabase,shop}=await requireFounder();const path=request.nextUrl.searchParams.get("path");
  if(!path?.startsWith(`${shop.id}/`)||path.includes("..")||path.length>300)return NextResponse.json({error:"Invalid document"},{status:400});
  const {data,error}=await supabase.storage.from("business-documents").createSignedUrl(path,60);
  if(error||!data)return NextResponse.json({error:"Document not available"},{status:404});
  return NextResponse.redirect(data.signedUrl,{headers:{"Cache-Control":"private, no-store"}});
}
