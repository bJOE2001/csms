import Link from "next/link";
import{MutationForm}from "@/components/mutation-form";
import{acceptInvite}from "@/app/auth/account-actions";
export default async function AcceptInvitation({searchParams}:{searchParams:Promise<{token?:string}>}){const{token}=await searchParams;return <main className="shell"><section className="auth-card"><h1>Accept shop invitation</h1><p className="hint">Sign in with the verified email that received this invitation. It expires after seven days.</p><MutationForm action={acceptInvite} submitLabel="Accept membership"><input type="hidden" name="token" value={token??""}/></MutationForm><Link className="top-link" href="/app">Open workspace</Link></section></main>;}
