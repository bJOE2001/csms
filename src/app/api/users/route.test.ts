import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), member: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc,
  from: () => { const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, maybeSingle: mocks.member }; return query; },
}) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { GET, POST } from "./route";
const id = "00000000-0000-4000-8000-000000008801";
const request = (body: unknown, origin = "http://localhost:3000") => new NextRequest("http://localhost:3000/api/users", {
  method: "POST", headers: { origin, host: "localhost:3000", "Content-Type": "application/json" }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("APP_URL", "http://localhost:3000");
  mocks.getUser.mockResolvedValue({ data: { user: { id } } });
  mocks.member.mockResolvedValue({ data: { role: "founder", shop_id: id } });
  mocks.rpc.mockResolvedValue({ data: { members: [], invitations: [] }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("User Management API authorization", () => {
  it("uses the authenticated shop and returns uncached data", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("read_shop_users", { p_shop_id: id });
  });
  it("rejects signed-out users and staff before reading or writing users", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET()).status).toBe(401);
    mocks.getUser.mockResolvedValue({ data: { user: { id } } });
    mocks.member.mockResolvedValue({ data: { role: "staff", shop_id: id, permissions: { users: ["view"] } } });
    expect((await GET()).status).toBe(403);
    expect((await POST(request({ action: "revoke", id }))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("saves explicit grants, ignores forged shop/role fields, and invalidates workspace access", async () => {
    const response = await POST(request({ action: "invite", email: "Staff@Example.test", permissions: { menu: ["view", "create"] }, shop_id: "forged", role: "founder" }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("manage_shop_user", { p_shop_id: id, p_data: { action: "invite", email: "staff@example.test", permissions: { menu: ["view", "create"] } } });
    expect(mocks.revalidate).toHaveBeenCalledWith("/app", "layout");
  });
  it.each([{ users: ["view"] }, { menu: ["delete"] }, { pos: ["view", "refund"] }])("rejects invalid grants: %j", permissions => {
    return POST(request({ action: "invite", email: "staff@example.test", permissions })).then(response => {
      expect(response.status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
    });
  });
  it("rejects cross-origin and oversized requests", async () => {
    expect((await POST(request({ action: "revoke", id }, "https://evil.example"))).status).toBe(403);
    expect((await POST(request({ padding: "x".repeat(17000) }))).status).toBe(413);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("surfaces denied actions and missing migration failures without claiming success", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "42501", message: "Owner account protected" } });
    expect((await POST(request({ action: "update", id, status: "suspended", permissions: {} }))).status).toBe(403);
    expect(mocks.revalidate).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ error: { code: "PGRST202" } });
    const response = await GET(); expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("User Management migration");
  });
});
