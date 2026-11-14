import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const supabase = await createClient(),
    query = request.nextUrl.searchParams;
  const code = query.get("code"),
    hash = query.get("token_hash"),
    type = query.get("type");
  const requested = query.get("next");
  const isJoin = Boolean(requested && /^\/join\?token=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requested));
  let succeeded = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    succeeded = !error;
  } else if (hash && (type === "invite" || type === "recovery" || type === "signup" || type === "email")) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: hash, type });
    succeeded = !error;
  }
  if (!succeeded)
    return NextResponse.redirect(
      new URL(isJoin ? "/login?confirmed=1" : "/login?error=credentials", process.env.APP_URL ?? request.url),
    );
  const next = requested === "/reset-password" || (requested && isJoin) ? requested : "/dashboard";
  const response = NextResponse.redirect(
    new URL(next, process.env.APP_URL ?? request.url),
  );
  return response;
}
