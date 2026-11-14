import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc, auth: { getUser: mocks.getUser } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
import { POST } from "./route";

const id = "00000000-0000-4000-8000-000000000001";
const edit = {
  id,
  operation_id: "00000000-0000-4000-8000-000000000002",
  spent_on: "2026-11-03",
  description: "Electricity",
  amount_cents: 4500,
  expected: { spent_on: "2026-11-02", description: "Electricity", amount_cents: 2000 },
};
const request = (data: unknown = edit, action = "update_expense") => new NextRequest("http://localhost:3000/api/pos", {
  method: "POST",
  headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" },
  body: JSON.stringify({ action, shop_id: id, data }),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_URL", "http://localhost:3000");
  mocks.getUser.mockResolvedValue({ data: { user: { id } } });
  mocks.rpc.mockResolvedValue({ data: { ...edit, voided: false }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("expense mutations", () => {
  it("validates an edit, uses the existing POS API and revalidates both reports", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("pos_update_expense", { p_shop_id: id, p_data: edit });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/expenses");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/sales");
  });
  it.each([0, -1, 1.5, 100000001])("rejects invalid cents %s before accessing the database", async amount_cents => {
    expect((await POST(request({ ...edit, amount_cents }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires the original fields and a real date", async () => {
    expect((await POST(request({ ...edit, expected: undefined }))).status).toBe(400);
    expect((await POST(request({ ...edit, spent_on: "2026-02-30" }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated edits", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("preserves database authorization and conflict failures without invalidating reports", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "42501", message: "Access denied" } });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Access denied" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
  it.each(["expense", "void_expense"])("keeps the existing %s action compatible", async action => {
    expect((await POST(request(edit, action))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(action === "expense" ? "pos_add_expense" : "pos_void_expense",
      action === "expense" ? { p_shop_id: id, p_data: { id, spent_on: edit.spent_on, description: edit.description, amount_cents: edit.amount_cents } } : { p_shop_id: id, p_id: id });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/sales");
  });
});

describe("offline checkout capture time", () => {
  const sale = { id, method: "cash", captured_at: "2026-11-12T08:30:00.000Z", items: [{ product_id: id, quantity: 1, price_cents: 100 }] };
  it("passes the original capture time into the transactional checkout", async () => {
    expect((await POST(request(sale, "checkout"))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("pos_checkout", { p_shop_id: id, p_data: sale });
  });
  it("rejects an ambiguous capture time before calling checkout", async () => {
    expect((await POST(request({ ...sale, captured_at: "2026-11-12" }, "checkout"))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects a saved sale from another cashier before calling checkout", async () => {
    const response = await POST(new NextRequest("http://localhost:3000/api/pos", {
      method: "POST",
      headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ action: "checkout", shop_id: id, user_id: "00000000-0000-4000-8000-000000000002", data: sale }),
    }));
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
