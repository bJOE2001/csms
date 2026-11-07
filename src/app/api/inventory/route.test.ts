import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), member: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  rpc: mocks.rpc, auth: { getUser: mocks.getUser },
  from: () => { const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, maybeSingle: mocks.member }; return query; },
}) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { GET, POST } from "./route";
const id = "00000000-0000-4000-8000-000000000001";
const item = { id, name: "Ground Coffee", base_unit: "g", item_type: "ingredient", minimum_stock: "100", active: true, notes: "" };
const get = (range = "from=2026-11-01&to=2026-11-07") => new NextRequest(`http://localhost:3000/api/inventory?${range}`);
const post = (data: unknown = item, origin = "http://localhost:3000") => new NextRequest("http://localhost:3000/api/inventory", {
  method: "POST", headers: { origin, host: "localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ action: "item", data }),
});
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("APP_URL", "http://localhost:3000");
  mocks.getUser.mockResolvedValue({ data: { user: { id } } });
  mocks.member.mockResolvedValue({ data: { shop_id: id, role: "founder", shops: { timezone: "Asia/Manila" } }, error: null });
  mocks.rpc.mockResolvedValue({ data: { items: [], movements: [], configs: [], returnable: [] }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("owner Inventory API boundary", () => {
  it("reads the authenticated shop and preserves inclusive date strings", async () => {
    const response = await GET(get()); expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("pos_inventory_read", { p_shop_id: id, p_from: "2026-11-01", p_to: "2026-11-07" });
  });
  it.each(["from=2026-11-08&to=2026-11-07", "from=2026-02-30&to=2026-11-07", "from=&to=2026-11-07"])("rejects invalid dates: %s", async range => {
    expect((await GET(get(range))).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("blocks unauthenticated and staff reads and writes before querying stock", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(get())).status).toBe(401); expect((await POST(post())).status).toBe(401);
    mocks.getUser.mockResolvedValue({ data: { user: { id } } });
    mocks.member.mockResolvedValue({ data: { shop_id: id, role: "staff" }, error: null });
    expect((await GET(get())).status).toBe(403); expect((await POST(post())).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects cross-origin mutations and client-supplied balance overrides", async () => {
    expect((await POST(post(item, "https://untrusted.invalid"))).status).toBe(403);
    expect((await POST(post({ ...item, quantity: "999" }))).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("revalidates dependent private modules only after a confirmed save", async () => {
    expect((await POST(post())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("pos_inventory_create_item", { p_shop_id: id, p_data: item });
    expect(mocks.revalidate).toHaveBeenCalledWith("/pos"); expect(mocks.revalidate).toHaveBeenCalledWith("/app/menu");
    mocks.revalidate.mockClear(); mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "Stock changed after this count was opened." } });
    const response = await POST(post()); expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "Stock changed after this count was opened." }); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("reports missing migrations without returning a fake empty inventory", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Unknown RPC" } });
    const response = await GET(get()); expect(response.status).toBe(503); expect(await response.json()).toHaveProperty("error");
  });
});
