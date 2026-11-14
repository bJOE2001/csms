import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), authenticate: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.create }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { signIn } from "@/app/login/actions";

const idle = { status: "idle" } as const;
function form(email = "staff@example.invalid", password = "test-only-placeholder") {
  const data = new FormData(); data.set("email", email); data.set("password", password); return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.create.mockResolvedValue({ auth: { signInWithPassword: mocks.authenticate } });
  mocks.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
});
it("validates required and malformed fields before contacting Auth", async () => {
  expect(await signIn(idle, form("", ""))).toMatchObject({ status: "error", fieldErrors: { email: "Enter your email.", password: "Enter your password." } });
  expect(await signIn(idle, form("invalid"))).toMatchObject({ fieldErrors: { email: "Enter a valid email address." } });
  expect(mocks.create).not.toHaveBeenCalled();
});
it("keeps credential errors generic and never returns submitted credentials", async () => {
  mocks.authenticate.mockResolvedValue({ error: { status: 400, message: "Sensitive account details" } });
  const result = await signIn(idle, form());
  expect(result).toEqual({ status: "error", message: "Invalid email or password." });
  expect(JSON.stringify(result)).not.toMatch(/staff@example|placeholder|Sensitive/);
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it("handles provider throttling and network failures without exposing internal errors", async () => {
  mocks.authenticate.mockResolvedValueOnce({ error: { status: 429 } });
  expect(await signIn(idle, form())).toMatchObject({ message: "Too many attempts. Please wait and try again." });
  mocks.create.mockRejectedValueOnce(new Error("Private connection failure"));
  expect(await signIn(idle, form())).toMatchObject({ message: "Sign-in is unavailable. Please check your connection and try again." });
});
it("uses the existing provider and redirects successful sign-in to Dashboard", async () => {
  mocks.authenticate.mockResolvedValue({ error: null });
  await expect(signIn(idle, form())).rejects.toThrow("NEXT_REDIRECT");
  expect(mocks.authenticate).toHaveBeenCalledWith({ email: "staff@example.invalid", password: "test-only-placeholder" });
  expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
});
