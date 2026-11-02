import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSameOrigin } from "@/lib/http";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request, process.env.APP_URL))
    return new NextResponse("Invalid origin", { status: 403 });
  const supabase = await createClient();
  await supabase.auth.signOut();
  const response = NextResponse.redirect(
    new URL("/", request.headers.get("origin")!),
    { status: 303 },
  );
  return response;
}
