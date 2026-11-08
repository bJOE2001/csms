import { describe, expect, it, vi } from "vitest";
import { createRecipeSaveAttempt, saveRecipeAttempt, type RecipeDraftInput } from "./recipe-save";

const input: RecipeDraftInput = {
  product_id: "00000000-0000-4000-8000-000000000001",
  size_id: "00000000-0000-4000-8000-000000000002",
  expected_revision: 7, mode: "recipe",
  components: [{ ingredient_id: "00000000-0000-4000-8000-000000000003", quantity: "18" }],
};

describe("recipe save and activation", () => {
  it("saves current components before activation with separate operation IDs and consecutive revisions", async () => {
    const attempt = createRecipeSaveAttempt(input, true);
    const write = vi.fn().mockResolvedValue({});
    const stage = vi.fn();
    await saveRecipeAttempt(attempt, write, stage);
    expect(write.mock.calls.map(([payload]) => payload.action)).toEqual(["draft", "activate"]);
    expect(write.mock.calls[0][0]).toMatchObject({ ...input, action: "draft" });
    expect(write.mock.calls[1][0]).toMatchObject({ action: "activate", expected_revision: 8, size_id: input.size_id });
    expect(attempt.draft.operation_id).not.toBe(attempt.activation!.operation_id);
    expect(stage.mock.calls.flat()).toEqual(["draft", "activate"]);
    expect(attempt.activated).toBe(true);
  });

  it("leaves optional draft saves inactive", async () => {
    const attempt = createRecipeSaveAttempt(input, false);
    const write = vi.fn().mockResolvedValue({});
    await saveRecipeAttempt(attempt, write);
    expect(write).toHaveBeenCalledTimes(1);
    expect(attempt.draftSaved).toBe(true);
    expect(attempt.activated).toBe(false);
  });

  it("activates an unchanged saved draft without creating another version", async () => {
    const attempt = createRecipeSaveAttempt(input, true, true);
    const write = vi.fn().mockResolvedValue({});
    await saveRecipeAttempt(attempt, write);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toMatchObject({ action: "activate", expected_revision: 7 });
  });

  it("never activates after a failed draft write and retries that exact draft operation", async () => {
    const attempt = createRecipeSaveAttempt(input, true);
    const write = vi.fn().mockRejectedValueOnce(Error("Connection lost")).mockResolvedValue({});
    await expect(saveRecipeAttempt(attempt, write)).rejects.toThrow("Connection lost");
    expect(attempt.draftSaved).toBe(false);
    const original = structuredClone(write.mock.calls[0][0]);
    await saveRecipeAttempt(attempt, write);
    expect(write.mock.calls[1][0]).toEqual(original);
    expect(write.mock.calls[2][0].action).toBe("activate");
  });

  it("retries failed activation without another draft or a different activation operation", async () => {
    const attempt = createRecipeSaveAttempt(input, true);
    const write = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(Error("Recipe changed")).mockResolvedValue({});
    await expect(saveRecipeAttempt(attempt, write)).rejects.toThrow("Recipe changed");
    expect(attempt.draftSaved).toBe(true);
    expect(attempt.activated).toBe(false);
    const original = structuredClone(write.mock.calls[1][0]);
    await saveRecipeAttempt(attempt, write);
    expect(write.mock.calls[2][0]).toEqual(original);
    expect(write.mock.calls.filter(([payload]) => payload.action === "draft")).toHaveLength(1);
    await saveRecipeAttempt(attempt, write);
    expect(write).toHaveBeenCalledTimes(3);
  });

  it("reuses operation IDs when activation committed but its response was lost", async () => {
    const attempt = createRecipeSaveAttempt(input, true);
    const committed = new Set<string>();
    const write = vi.fn(async (payload: typeof attempt.draft) => {
      if (committed.has(payload.operation_id)) return {};
      committed.add(payload.operation_id);
      if (payload.action === "activate") throw Error("Response lost");
      return {};
    });
    await expect(saveRecipeAttempt(attempt, write)).rejects.toThrow("Response lost");
    await saveRecipeAttempt(attempt, write);
    expect(committed.size).toBe(2);
    expect(attempt.activated).toBe(true);
  });

  it("rejects incomplete components before any save-and-activate request", () => {
    expect(() => createRecipeSaveAttempt({ ...input, components: [] }, true)).toThrow("Add at least one component");
    expect(() => createRecipeSaveAttempt({ ...input, components: [{ ...input.components[0], quantity: "0" }] }, true)).toThrow();
    expect(() => createRecipeSaveAttempt({ ...input, components: [] }, false)).not.toThrow();
  });
});
