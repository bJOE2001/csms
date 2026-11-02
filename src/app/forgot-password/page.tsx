import Link from "next/link";
import{MutationForm}from "@/components/mutation-form";
import{requestPasswordReset}from "@/app/auth/account-actions";
export default function ForgotPassword(){return <main className="shell"><section className="auth-card"><p className="eyebrow">Account recovery</p><h1>Reset your password</h1><MutationForm action={requestPasswordReset} submitLabel="Request recovery email"><label className="field">Account email<input type="email" name="email" autoComplete="email" required/></label></MutationForm><Link className="top-link" href="/sign-in">Back to sign in</Link></section></main>;}
