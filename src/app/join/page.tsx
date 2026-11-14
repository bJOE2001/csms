import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { JoinForm } from "@/components/users/join-form";

export const metadata: Metadata = { title: "Team Invitation", robots: { index: false, follow: false } };

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const valid = z.uuid().safeParse(token);
  const result = valid.success ? await db.rpc("membership_invite_details", { p_token: valid.data }) : null;
  const invite = !result?.error ? result?.data as { email: string; shop_name: string } | null : null;
  const wrongAccount = user && invite && user.email?.toLowerCase() !== invite.email.toLowerCase();
  if (invite && valid.success && user && !wrongAccount) {
    const accepted = await db.rpc("accept_membership_invite", { p_token: valid.data });
    if (!accepted.error) redirect("/app");
  }
  return (
    <main className="sign-in-page">
      <div className="sign-in-stack">
        <div className="sign-in-logo">
          <BrandLogo />
        </div>
        <section className="sign-in-card" aria-labelledby="account-title">
          <header>
            <p className="eyebrow">Team invitation</p>
            <h1 id="account-title">{invite ? `Join ${invite.shop_name}` : "Invitation unavailable"}</h1>
            <p>
              {invite
                ? "Your shop owner has selected the modules and actions available to your account."
                : "This invitation may have expired or been revoked. Ask your shop owner for a new link."}
            </p>
          </header>
          {invite && valid.success && (wrongAccount ? (
            <>
              <p className="hint">Sign out and use the invited email, {invite.email}, to accept this invitation.</p>
              <form action={`/auth/sign-out?next=${encodeURIComponent(`/join?token=${valid.data}`)}`} method="post">
                <Button className="secondary sign-in-submit" type="submit">Sign out</Button>
              </form>
            </>
          ) : (
            <JoinForm token={valid.data} email={invite.email} signedIn={!!user} />
          ))}
          {!invite && <Link className="sign-in-return" href="/app">Open your workspace</Link>}
        </section>
      </div>
    </main>
  );
}
