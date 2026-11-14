import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, auth: { signInWithPassword: mocks.signIn, signUp: mocks.signUp, signOut: mocks.signOut } }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Error(`REDIRECT:${path}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "http://localhost:3000" }) }));
import { joinShop } from "./actions";
const token = "00000000-0000-4000-8000-000000008801";
const form = (intent: string, extra: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ token, intent, password: "safe-password", confirm: "safe-password", name: "Counter Staff", ...extra })) data.set(key, value);
  return data;
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockImplementation((name: string) => Promise.resolve(name === "membership_invite_details"
    ? { data: { email: "invited@example.test" }, error: null } : { data: "shop", error: null }));
  mocks.signIn.mockResolvedValue({ error: null });
  mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});
describe("invited account setup", () => {
  it("uses the email bound to the token and accepts only after authentication", async () => {
    await expect(joinShop({ status: "idle" }, form("sign_in", { email: "attacker@example.test" }))).rejects.toThrow("REDIRECT:/app");
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "invited@example.test", password: "safe-password" });
    expect(mocks.rpc).toHaveBeenLastCalledWith("accept_membership_invite", { p_token: token });
  });
  it("redirects to login without accepting or auto-signing in when confirmation is pending", async () => {
    await expect(joinShop({ status: "idle" }, form("create"))).rejects.toThrow("REDIRECT:/login?created=1");
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: "invited@example.test", options: expect.objectContaining({ data: { display_name: "Counter Staff", invite_token: token }, emailRedirectTo: expect.stringContaining(encodeURIComponent(`/join?token=${token}`)) }) }));
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["membership_invite_details"]);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
  it("accepts, signs out, and redirects to login when signup returns an active session", async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { session: { access_token: "token" } }, error: null });
    await expect(joinShop({ status: "idle" }, form("create"))).rejects.toThrow("REDIRECT:/login?created=1");
    expect(mocks.rpc).toHaveBeenLastCalledWith("accept_membership_invite", { p_token: token });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });
  it("requires matching password and confirm password when creating an account", async () => {
    const state = await joinShop({ status: "idle" }, form("create", { confirm: "different-password" }));
    expect(state).toEqual({ status: "error", message: "Passwords do not match." });
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
  it("returns an error without auto-signing in when the email is already registered", async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { session: null }, error: { code: "user_already_exists", message: "User already registered" } });
    const state = await joinShop({ status: "idle" }, form("create"));
    expect(state).toEqual({
      status: "error",
      message: "An account with this email already exists. Please sign in on the login page.",
    });
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
  it("surfaces a clear rate-limit message when Supabase email quota is hit", async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { session: null }, error: { code: "over_email_send_rate_limit", message: "Email rate limit exceeded" } });
    const state = await joinShop({ status: "idle" }, form("create"));
    expect(state.status).toBe("error");
    expect(state.message).toContain("Supabase email limit reached");
  });
  it("does not authenticate or accept an expired/revoked invitation", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect((await joinShop({ status: "idle" }, form("sign_in"))).status).toBe("error");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it("retains an acceptance error instead of redirecting on an email or membership mismatch", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { email: "invited@example.test" } }).mockResolvedValueOnce({ error: { code: "42501", message: "Invitation belongs to another verified email" } });
    expect(await joinShop({ status: "idle" }, form("accept"))).toEqual({ status: "error", message: "Invitation belongs to another verified email" });
  });
});
