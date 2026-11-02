import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createShop } from "./actions";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: existing } = await supabase.from("shop_members").select("shop_id").eq("user_id", user.id).limit(1);
  if (existing?.length) redirect("/app");

  const message = error ? "The shop could not be created. Check that migrations are applied and your account has no existing membership." : undefined;
  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">◒</span>
          <span>COFFEE SHOP MANAGEMENT</span>
        </Link>
        <form action="/auth/sign-out" method="post">
          <button className="top-link" type="submit">Sign out</button>
        </form>
      </header>
      <section className="auth-card">
        <div className="eyebrow">Founder setup</div>
        <h1>Create your shop</h1>
        <p className="hint">This creates a pre-opening shop and grants the signed-in account founder access. You can configure details later.</p>
        {message && <p className="hint" role="alert" style={{ color: "#9b3527" }}>{message}</p>}
        <form action={createShop}>
          <label className="field">Shop name<input name="name" maxLength={120} required /></label>
          <label className="field">Business timezone<input name="timezone" defaultValue="Asia/Manila" maxLength={80} required /></label>
          <button className="button" type="submit">Create shop</button>
        </form>
      </section>
    </main>
  );
}
