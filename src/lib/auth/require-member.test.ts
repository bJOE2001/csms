import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  activeMember: vi.fn(),
  existingMember: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw Error(`REDIRECT:${path}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: () => {
      let hasStatusFilter = false;
      const query = {
        select: () => query,
        eq: (column: string) => {
          if (column === "status") hasStatusFilter = true;
          return query;
        },
        order: () => query,
        limit: () => query,
        maybeSingle: () => (hasStatusFilter ? mocks.activeMember() : mocks.existingMember()),
      };
      return query;
    },
  }),
}));

import { requireMember } from "./require-member";

const userId = "00000000-0000-4000-8000-000000008801";
const shop = { id: "00000000-0000-4000-8000-000000008810", name: "Sip&Snap", timezone: "Asia/Manila" };
const token = "00000000-0000-4000-8000-000000008899";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: userId, user_metadata: {} } } });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.activeMember.mockResolvedValue({ data: null, error: null });
  mocks.existingMember.mockResolvedValue({ data: null, error: null });
});

describe("requireMember single-shop access resolution", () => {
  it("resolves pending invitation via user_metadata.invite_token and resolve_shop_access", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId, user_metadata: { invite_token: token } } } });
    mocks.activeMember
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { role: "staff", permissions: { pos: ["view", "checkout"] }, shops: shop }, error: null });

    const result = await requireMember("pos");

    expect(mocks.rpc.mock.calls).toEqual([
      ["accept_membership_invite", { p_token: token }],
      ["resolve_shop_access"],
    ]);
    expect(result.shop).toEqual(shop);
    expect(result.role).toBe("staff");
  });

  it("resolves single-shop bootstrap or email invite via resolve_shop_access without invite_token", async () => {
    mocks.activeMember
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { role: "founder", permissions: null, shops: shop }, error: null });

    const result = await requireMember();

    expect(mocks.rpc.mock.calls).toEqual([["resolve_shop_access"]]);
    expect(result.shop).toEqual(shop);
    expect(result.role).toBe("founder");
  });

  it("redirects uninvited users to /access-denied instead of /app/setup", async () => {
    await expect(requireMember()).rejects.toThrow("REDIRECT:/access-denied");
    expect(mocks.rpc.mock.calls).toEqual([["resolve_shop_access"]]);
  });

  it("redirects suspended members to /access-denied without calling resolve_shop_access", async () => {
    mocks.existingMember.mockResolvedValue({ data: { id: "member-1" }, error: null });

    await expect(requireMember()).rejects.toThrow("REDIRECT:/access-denied");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
