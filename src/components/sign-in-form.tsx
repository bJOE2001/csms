"use client";
import { useActionState, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { BrandLogo } from "./brand-logo";
import { Button } from "./ui/button";
import { Input } from "./ui/primitives/input";
import { credentialErrors, type SignInState } from "@/lib/auth/sign-in";

export function SignInForm({ action, initialError }: {
  action: (previous: SignInState, form: FormData) => Promise<SignInState>; initialError?: string;
}) {
  const id = useId();
  const [state, formAction, pending] = useActionState(async (previous: SignInState, form: FormData): Promise<SignInState> => {
    try { return await action(previous, form); }
    catch (error) {
      // Fetch transport failures are recoverable; framework navigation signals must still propagate.
      if (!(error instanceof TypeError)) throw error;
      return { status: "error", message: "Sign-in is unavailable. Please check your connection and try again." };
    }
  }, { status: initialError ? "error" : "idle", message: initialError } as SignInState);
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [localErrors, setLocalErrors] = useState<SignInState["fieldErrors"]>();
  const emailInput = useRef<HTMLInputElement>(null), passwordInput = useRef<HTMLInputElement>(null), errorMessage = useRef<HTMLParagraphElement>(null);
  const errors = localErrors ?? state.fieldErrors;
  const pointerFocus = useRef(false);
  const selection = useRef<{ start: number; end: number; restoreFocus: boolean } | null>(null);
  useLayoutEffect(() => {
    const saved = selection.current;
    if (!saved) return;
    selection.current = null;
    if (saved.restoreFocus) passwordInput.current?.focus({ preventScroll: true });
    passwordInput.current?.setSelectionRange(saved.start, saved.end);
  }, [visible]);
  useEffect(() => {
    if (state.status !== "error") return;
    if (state.fieldErrors?.email) emailInput.current?.focus();
    else if (state.fieldErrors?.password) passwordInput.current?.focus();
    else errorMessage.current?.focus();
  }, [state]);
  return <main className="sign-in-page">
    <div className="sign-in-stack">
      <div className="sign-in-logo"><BrandLogo /></div>
      <section className="sign-in-card" aria-labelledby={`${id}-title`}>
        <header><h1 id={`${id}-title`}>Welcome back</h1><p>Sign in to access LOGO Coffee POS.</p></header>
        <form action={formAction} noValidate aria-busy={pending || undefined} onSubmit={event => {
          if (pending) { event.preventDefault(); return; }
          const next = credentialErrors(email, password);
          setLocalErrors(next);
          if (next) {
            event.preventDefault();
            requestAnimationFrame(() => (next.email ? emailInput : passwordInput).current?.focus());
          }
        }}>
          {state.message && <p ref={errorMessage} className="form-message error sign-in-error" role="alert" tabIndex={-1}>{state.message}</p>}
          <div className="field"><label htmlFor={`${id}-email`}>Email</label>
            <Input ref={emailInput} id={`${id}-email`} name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="name@example.com" value={email} onChange={event => setEmail(event.target.value)} required readOnly={pending} aria-invalid={!!errors?.email || undefined} aria-describedby={errors?.email ? `${id}-email-error` : undefined} />
            {errors?.email && <p className="sign-in-field-error" id={`${id}-email-error`}>{errors.email}</p>}
          </div>
          <div className="field">
            <label htmlFor={`${id}-password`}>Password</label>
            <div className="sign-in-password input-group">
              <Input ref={passwordInput} id={`${id}-password`} focusOwner="parent" name="password" type={visible ? "text" : "password"} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} maxLength={256} required readOnly={pending} aria-invalid={!!errors?.password || undefined} aria-describedby={errors?.password ? `${id}-password-error` : undefined} />
              <button type="button" className="sign-in-password-toggle" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} disabled={pending} onPointerDown={event => { pointerFocus.current = document.activeElement === passwordInput.current; event.preventDefault(); }} onClick={() => {
                const input = passwordInput.current;
                selection.current = { start: input?.selectionStart ?? 0, end: input?.selectionEnd ?? 0, restoreFocus: pointerFocus.current };
                pointerFocus.current = false;
                setVisible(current => !current);
              }}>{visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
            </div>
            {errors?.password && <p className="sign-in-field-error" id={`${id}-password-error`}>{errors.password}</p>}
          </div>
          <Button type="submit" pending={pending} pendingLabel="Signing in…" className="sign-in-submit">Sign in</Button>
        </form>
      </section>
      <Link className="sign-in-return" href="/">Back to website</Link>
    </div>
  </main>;
}
