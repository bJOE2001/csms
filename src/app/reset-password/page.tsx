import Link from "next/link";
import{MutationForm}from "@/components/mutation-form";
import{changePassword}from "@/app/auth/account-actions";
export default function ResetPassword(){return <main className="shell"><section className="auth-card"><p className="eyebrow">Account security</p><h1>Choose a password</h1><MutationForm action={changePassword} submitLabel="Update password"><label className="field">New password<input type="password" name="password" minLength={12} maxLength={256} autoComplete="new-password" required/></label><label className="field">Confirm password<input type="password" name="confirm" minLength={12} maxLength={256} autoComplete="new-password" required/></label></MutationForm><Link className="top-link" href="/app">Return to workspace</Link></section></main>;}
