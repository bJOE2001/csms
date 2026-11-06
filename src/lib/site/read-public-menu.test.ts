import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), rpc: vi.fn(), response: null as unknown, error: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
import { readPublicMenu } from "./read-public-menu";

const shopId = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.stubEnv("PUBLIC_MENU_SHOP_ID", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "must-never-be-used");
  vi.stubEnv("SUPABASE_URL", ""); vi.stubEnv("SUPABASE_ANON_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_test");
  mocks.response = { status: "published", products: [] }; mocks.error = null;
  mocks.rpc.mockReset(); mocks.createClient.mockReset();
  mocks.rpc.mockImplementation(() => ({ abortSignal: () => Promise.resolve({ data: mocks.response, error: mocks.error }) }));
  mocks.createClient.mockReturnValue({ rpc: mocks.rpc });
});
afterEach(() => vi.unstubAllEnvs());

describe("public catalog server reader", () => {
  it("uses only the public key and lets the database resolve a single published shop", async () => {
    expect(await readPublicMenu()).toEqual({ status: "published", products: [] });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("read_public_menu", {});
    expect(mocks.createClient).toHaveBeenCalledWith("https://database.example", "sb_publishable_test", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    expect(JSON.stringify(mocks.createClient.mock.calls)).not.toContain("must-never-be-used");
  });
  it("honors an explicit shop selection without querying private tables", async () => {
    vi.stubEnv("PUBLIC_MENU_SHOP_ID", shopId);
    mocks.response = { status: "published", products: [{ id: shopId, name: "Latte", description: "Coffee", category: "Coffee", image: null, price: 12000, sizes: [{ label: "Custom", price: 12000 }] }] };
    expect((await readPublicMenu()).products[0].price).toBe(12000);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("read_public_menu", { p_shop_id: shopId });
  });
  it("fails closed for invalid shop IDs or missing public credentials", async () => {
    vi.stubEnv("PUBLIC_MENU_SHOP_ID", "not-a-shop");
    expect(await readPublicMenu()).toEqual({ status: "unpublished", products: [] });
    expect(mocks.createClient).not.toHaveBeenCalled();
    vi.stubEnv("PUBLIC_MENU_SHOP_ID", ""); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(await readPublicMenu()).toEqual({ status: "unpublished", products: [] });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("supports the existing public runtime override and legacy anon-key configuration", async () => {
    vi.stubEnv("SUPABASE_URL", "https://runtime.example"); vi.stubEnv("SUPABASE_ANON_KEY", "legacy-public-key");
    await readPublicMenu();
    expect(mocks.createClient.mock.calls[0].slice(0, 2)).toEqual(["https://runtime.example", "legacy-public-key"]);
    mocks.createClient.mockClear(); vi.stubEnv("SUPABASE_ANON_KEY", "");
    expect(await readPublicMenu()).toEqual({ status: "unpublished", products: [] });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("preserves an unpublished response rather than falling back to private access", async () => {
    mocks.response = { status: "unpublished", products: [] };
    expect(await readPublicMenu()).toEqual(mocks.response);
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
  });
  it("returns a clear failure for database errors or an unapplied migration", async () => {
    mocks.error = { code: "PGRST202", message: "Function not found" };
    expect(await readPublicMenu()).toEqual({ status: "unavailable", products: [] });
  });
  it("rejects malformed responses and any unexpected private fields", async () => {
    for (const response of [null, { status: "published", products: [], cost_cents: 42 }, { status: "published", products: [{ id: shopId, name: "Latte", description: "", category: "Coffee", image: null, price: 100, sizes: [{ label: "Small", price: 100, cost_cents: 50 }] }] }]) {
      mocks.response = response;
      expect(await readPublicMenu()).toEqual({ status: "unavailable", products: [] });
    }
  });
});
