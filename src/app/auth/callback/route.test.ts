import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ exchange: vi.fn(), verify: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { exchangeCodeForSession: mocks.exchange, verifyOtp: mocks.verify } }) }));
import { GET } from "./route";
const join = "/join?token=00000000-0000-4000-8000-000000008801";
beforeEach(() => { vi.resetAllMocks(); mocks.exchange.mockResolvedValue({ error: null }); mocks.verify.mockResolvedValue({ error: null }); });
describe("invitation confirmation redirects", () => {
  it("returns a confirmed account to its invitation", async () => {
    const response = await GET(new NextRequest(`http://localhost:3000/auth/callback?code=confirmed&next=${encodeURIComponent(join)}`));
    expect(new URL(response.headers.get("location")!).pathname + new URL(response.headers.get("location")!).search).toBe(join);
  });
  it("accepts confirmation token hashes for new accounts", async () => {
    const response = await GET(new NextRequest(`http://localhost:3000/auth/callback?token_hash=confirmed&type=email&next=${encodeURIComponent(join)}`));
    expect(mocks.verify).toHaveBeenCalledWith({ token_hash: "confirmed", type: "email" });
    expect(response.headers.get("location")).toContain("/join?token=");
  });
  it.each(["https://evil.example", "//evil.example", "/join?token=bad", `${join}&next=https://evil.example`])("rejects an unsafe return path: %s", async next => {
    const response = await GET(new NextRequest(`http://localhost:3000/auth/callback?code=confirmed&next=${encodeURIComponent(next)}`));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/dashboard");
  });
  it("redirects join confirmations to login with confirmed notice when PKCE code exchange fails", async () => {
    mocks.exchange.mockResolvedValue({ error: { message: "Code verifier missing" } });
    const response = await GET(new NextRequest(`http://localhost:3000/auth/callback?code=confirmed&next=${encodeURIComponent(join)}`));
    const destination = new URL(response.headers.get("location")!);
    expect(destination.pathname).toBe("/login");
    expect(destination.search).toBe("?confirmed=1");
  });
});
