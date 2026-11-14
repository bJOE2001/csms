"use client";
import { useActionState, useId, useLayoutEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { joinShop, type JoinState } from "@/app/join/actions";
import { SubmitButton } from "../ui/button";
import { Input } from "../ui/primitives/input";

function PasswordField({
  id,
  label,
  name,
  showLabel,
  hideLabel,
}: {
  id: string;
  label: string;
  name: string;
  showLabel: string;
  hideLabel: string;
}) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pointerFocus = useRef(false);
  const selection = useRef<{ start: number; end: number; restoreFocus: boolean } | null>(null);

  useLayoutEffect(() => {
    const saved = selection.current;
    if (!saved) return;
    selection.current = null;
    if (saved.restoreFocus) inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.setSelectionRange(saved.start, saved.end);
  }, [visible]);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="sign-in-password input-group">
        <Input
          ref={inputRef}
          id={id}
          name={name}
          focusOwner="parent"
          type={visible ? "text" : "password"}
          required
          minLength={8}
          maxLength={256}
          autoComplete="new-password"
        />
        <button
          type="button"
          className="sign-in-password-toggle"
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          onPointerDown={(event) => {
            pointerFocus.current = document.activeElement === inputRef.current;
            event.preventDefault();
          }}
          onClick={() => {
            const input = inputRef.current;
            selection.current = {
              start: input?.selectionStart ?? 0,
              end: input?.selectionEnd ?? 0,
              restoreFocus: pointerFocus.current,
            };
            pointerFocus.current = false;
            setVisible((current) => !current);
          }}
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

export function JoinForm({ token, email, signedIn }: { token: string; email: string; signedIn: boolean }) {
  const id = useId();
  const [state, action] = useActionState(joinShop, { status: "idle" } as JoinState);
  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="intent" value={signedIn ? "accept" : "create"} />
      <label className="field">
        Invited email
        <Input type="email" value={email} readOnly autoComplete="email" />
      </label>
      {!signedIn && (
        <>
          <label className="field">
            Your name
            <Input name="name" required autoComplete="name" maxLength={120} />
          </label>
          <PasswordField
            id={`${id}-password`}
            label="Password"
            name="password"
            showLabel="Show password"
            hideLabel="Hide password"
          />
          <PasswordField
            id={`${id}-confirm`}
            label="Confirm password"
            name="confirm"
            showLabel="Show confirm password"
            hideLabel="Hide confirm password"
          />
        </>
      )}
      {state.message && (
        <p className={`form-message ${state.status === "error" ? "error" : ""}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      )}
      <SubmitButton className="sign-in-submit" pendingLabel="Joining…">
        {signedIn ? "Accept invitation" : "Create account and join"}
      </SubmitButton>
    </form>
  );
}
