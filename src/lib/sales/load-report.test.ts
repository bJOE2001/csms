import { describe, expect, it, vi } from "vitest";
import { loadSalesReport } from "./load-report";
import type { requireMember } from "@/lib/auth/require-member";
type Client = Awaited<ReturnType<typeof requireMember>>["supabase"];
const report = (credits: { data: unknown; error: unknown }) => loadSalesReport({ rpc: vi.fn(name => Promise.resolve(name === "pos_inventory_cost_credits" ? credits : { data: [], error: null })) } as unknown as Client, "shop", "2026-11-01", "2026-11-07");
describe("dated inventory return credits", () => {
  it("passes confirmed integer credits to the shared reporting model", async () => {
    expect((await report({ data: 2500, error: null })).stockReturnCredits).toBe(2500);
  });
  it("keeps pre-migration reporting compatible only for a missing credit RPC", async () => {
    expect((await report({ data: null, error: { code: "PGRST202" } })).stockReturnCredits).toBe(0);
    await expect(report({ data: null, error: { code: "NETWORK" } })).rejects.toThrow("credits unavailable");
  });
  it.each([null, [], "2500", -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects malformed credits %s without presenting partial figures", async data => {
    await expect(report({ data, error: null })).rejects.toThrow("Invalid inventory cost credits");
  });
});
