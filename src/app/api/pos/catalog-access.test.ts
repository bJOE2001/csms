import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), member: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { GET } from "./route";
const id = "00000000-0000-4000-8000-000000008801";
const request = (moduleName?: string) => new NextRequest("http://localhost:3000/api/pos", { headers: moduleName ? { "X-Workspace-Module": moduleName } : {} });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id } } });
  mocks.member.mockResolvedValue({ data: { shop_id: id, role: "staff", permissions: { menu: ["view"] }, shops: { id, name: "Coffee" } }, error: null });
  mocks.rpc.mockResolvedValue({ data: {}, error: null });
  mocks.from.mockImplementation((table: string) => {
    const query = { select: () => query, eq: () => query, is: () => query,
      order: () => table === "shop_members" ? query : Promise.resolve({ data: [], error: null }), limit: () => query, maybeSingle: mocks.member };
    return query;
  });
});
describe("catalog module access", () => {
  it("allows the catalog for an explicitly granted Menu workspace without granting POS", async () => {
    expect((await GET(request())).status).toBe(403);
    const response = await GET(request("menu"));
    expect(response.status).toBe(200);
    expect((await response.json()).access).toEqual({ role: "staff", permissions: { menu: ["view"] } });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("does not trust arbitrary module headers or read product data without access", async () => {
    expect((await GET(request("libraries"))).status).toBe(403);
    expect((await GET(request("users"))).status).toBe(403);
    expect(mocks.from.mock.calls.map(call => call[0])).toEqual(["shop_members", "shop_members"]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("blocks signed-out and suspended accounts", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(request("menu"))).status).toBe(401);
    mocks.getUser.mockResolvedValue({ data: { user: { id } } });
    mocks.member.mockResolvedValue({ data: null, error: null });
    expect((await GET(request("menu"))).status).toBe(403);
  });
});
