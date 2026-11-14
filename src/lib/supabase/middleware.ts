import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "./env";
import type { Database } from "./database.types";
import { accessFor, can } from "@/lib/auth/permissions";
import { workspaceModule } from "@/lib/workspace";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, anonKey } = getSupabasePublicEnv();
  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }
  const activeModule = workspaceModule(request.nextUrl.pathname);
  if (activeModule) {
    const { data: member, error } = await supabase.from("shop_members").select("*")
      .eq("user_id", user.id).eq("status", "active").order("created_at").limit(1).maybeSingle();
    if (error) {
      const unavailable = new NextResponse("Shop access could not be checked. Please retry.", { status: 503, headers: { "Cache-Control": "private, no-store" } });
      response.cookies.getAll().forEach(cookie => unavailable.cookies.set(cookie));
      return unavailable;
    }
    if (!member || !can(accessFor(member.role, member.permissions), activeModule)) {
      const redirect = NextResponse.redirect(new URL("/app", request.url));
      response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
      redirect.headers.set("Cache-Control", "private, no-store");
      return redirect;
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
