import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reset: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.create }));
import { requestPasswordReset } from "@/app/auth/account-actions";
import { initialActionState } from "./action-state";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.create.mockResolvedValue({ auth: { resetPasswordForEmail: mocks.reset } });
});
it("does not report a successful recovery request after an API failure or expose account details", async () => {
  mocks.reset.mockResolvedValue({ error: { message: "Sensitive provider error" } });
  const form = new FormData();
  form.set("email", "owner@example.test");
  const result = await requestPasswordReset(initialActionState, form);
  expect(result.status).toBe("error");
  expect(result.message).not.toContain("Sensitive");
});
it("retains the non-enumerating confirmation after a confirmed request", async () => {
  mocks.reset.mockResolvedValue({ error: null });
  const form = new FormData();
  form.set("email", "owner@example.test");
  expect(await requestPasswordReset(initialActionState, form)).toMatchObject({ status: "success", message: expect.stringContaining("If that account exists") });
});
it("keeps invalid account input as inline validation without making an authentication request", async () => {
  const form = new FormData();
  form.set("email", "invalid");
  expect(await requestPasswordReset(initialActionState, form)).toMatchObject({ status: "error", validation: true });
  expect(mocks.create).not.toHaveBeenCalled();
});
