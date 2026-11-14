import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSameOrigin } from "@/lib/http";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request, process.env.APP_URL))
    return new NextResponse("Invalid origin", { status: 403 });
  const supabase = await createClient();
  await supabase.auth.signOut();
  const requested = request.nextUrl.searchParams.get("next");
  const destination = requested && /^\/join\?token=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requested) ? requested : "/";
  const response = NextResponse.redirect(
    new URL(destination, request.headers.get("origin")!),
    { status: 303 },
  );
  // Revokes offline access even when device IndexedDB is temporarily unavailable.
  // Keep queued sales; a verified catalog load after login clears this marker.
  response.cookies.set("sip-snap-pos-revoked", crypto.randomUUID(), {
    path: "/", sameSite: "strict", maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
