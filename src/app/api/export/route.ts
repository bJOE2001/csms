import { NextResponse,type NextRequest } from "next/server";
import { requireFounder } from "@/lib/auth/require-founder";
import { object,rows } from "@/lib/business/data";
import {csvCell as cell} from "@/lib/business/csv";

// Prevent spreadsheet formula execution when opening untrusted record text.
export async function GET(request:NextRequest) {
  const {supabase,shop}=await requireFounder();const start=request.nextUrl.searchParams.get("start"),end=request.nextUrl.searchParams.get("end");
  if(!start||!end||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end))return NextResponse.json({error:"Date range required"},{status:400});
  const {data,error}=await supabase.rpc("business_report",{p_shop_id:shop.id,p_start:start,p_end:end});if(error)return NextResponse.json({error:"Report unavailable"},{status:400});
  const report=object(data);const lines:string[]=["Section,Metric,Value (centavos where named _cents)"];
  for(const section of ["range","sales","finance"])for(const [key,value]of Object.entries(object(report[section])))lines.push([section,key,value].map(cell).join(","));
  for(const section of ["inventory","products","payments","sales_methods","movements"]){const records=rows(report[section]);if(records.length){const keys=Object.keys(records[0]);lines.push("",[section,...keys].map(cell).join(","));for(const r of records)lines.push([section,...keys.map(k=>r[k])].map(cell).join(","));}}
  return new NextResponse(`\uFEFF${lines.join("\r\n")}`,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="business-report-${start}-${end}.csv"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
