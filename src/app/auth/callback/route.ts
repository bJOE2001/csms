import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const supabase = await createClient(),
    query = request.nextUrl.searchParams;
  const code = query.get("code"),
    hash = query.get("token_hash"),
    type = query.get("type");
  let succeeded = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    succeeded = !error;
  } else if (hash && (type === "invite" || type === "recovery")) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: hash, type });
    succeeded = !error;
  }
  if (!succeeded)
    return NextResponse.redirect(
      new URL("/sign-in?error=credentials", process.env.APP_URL ?? request.url),
    );
  const next =
    query.get("next") === "/reset-password" ? "/reset-password" : "/pos";
  const response = NextResponse.redirect(
    new URL(next, process.env.APP_URL ?? request.url),
  );
  return response;
}
