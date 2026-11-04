import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), requests: [] as { table: string; fields?: string; filters: [string, unknown][] }[], products: [] as unknown[], categories: [] as unknown[], fail: false }));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
import { readPublicMenu } from "./read-public-menu";

const shopId = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.stubEnv("PUBLIC_MENU_SHOP_ID", shopId); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-test-secret"); vi.stubEnv("SUPABASE_URL", "https://database.example");
  mocks.products = []; mocks.categories = []; mocks.requests.length = 0; mocks.fail = false; mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => ({ from(table: string) {
    const entry = { table, fields: "", filters: [] as [string, unknown][] }; mocks.requests.push(entry);
    const query = { select(fields: string) { entry.fields = fields; return query; }, eq(key: string, value: unknown) { entry.filters.push([key, value]); return query; }, is(key: string, value: unknown) { entry.filters.push([key, value]); return query; }, order() { return query; }, abortSignal() { return Promise.resolve({ data: table === "pos_products" ? mocks.products : mocks.categories, error: mocks.fail ? { message: "Unavailable" } : null }); } };
    return query;
  } }));
});
afterEach(() => vi.unstubAllEnvs());

describe("public catalog server reader", () => {
  it("requires explicit publication configuration even in development", async () => {
    vi.stubEnv("PUBLIC_MENU_SHOP_ID", ""); vi.stubEnv("NODE_ENV", "development");
    expect(await readPublicMenu()).toEqual({ status: "unpublished", products: [] });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("restricts every read to the configured shop and exposes no privileged credentials or costs", async () => {
    mocks.products = [{ id: shopId, name: "Latte", active: true, price_cents: 10000, cost_cents: 3000, description: "Coffee", image_url: null, sizes: [{ id: shopId, label: "Custom", price_cents: 12000, cost_cents: 4500, active: true, is_default: true }] }];
    const result = await readPublicMenu();
    expect(result.status).toBe("published");
    expect(result.products[0].price).toBe(12000);
    expect(JSON.stringify(result)).not.toMatch(/cost_cents|server-test-secret|created_by|is_default/);
    expect(mocks.requests.map(request => request.table)).toEqual(["pos_products", "pos_categories"]);
    for (const request of mocks.requests) expect(request.filters).toContainEqual(["shop_id", shopId]);
    expect(mocks.requests[0].filters).toContainEqual(["archived_at", null]);
    expect(mocks.requests[0].fields).not.toContain("cost_cents");
    expect(mocks.createClient.mock.calls[0][2].auth.persistSession).toBe(false);
  });
  it("returns a clear failure instead of fabricated prices or partial data", async () => {
    mocks.fail = true;
    expect(await readPublicMenu()).toEqual({ status: "unavailable", products: [] });
    mocks.fail = false; mocks.products = [{ name: "Bad price", active: true, sizes: [], price_cents: -1 }];
    expect(await readPublicMenu()).toEqual({ status: "unavailable", products: [] });
  });
});
