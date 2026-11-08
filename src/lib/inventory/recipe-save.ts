import { recipeSchema } from "./domain";

type RecipePayload = ReturnType<typeof recipeSchema.parse>;
export type RecipeDraftInput = Omit<RecipePayload, "action" | "operation_id"> & {
  components: NonNullable<RecipePayload["components"]>;
};
export type RecipeSaveAttempt = {
  draft: RecipePayload;
  activation?: RecipePayload;
  draftSaved: boolean;
  activated: boolean;
  revisionAfterDraft: number;
};

export function createRecipeSaveAttempt(input: RecipeDraftInput, activate: boolean, useSavedDraft = false): RecipeSaveAttempt {
  const draft = recipeSchema.parse({ ...input, operation_id: crypto.randomUUID(), action: "draft" });
  if (activate && !draft.components?.length) throw Error("Add at least one component before activating the recipe.");
  const draftSaved = activate && useSavedDraft;
  const revisionAfterDraft = input.expected_revision + (draftSaved ? 0 : 1);
  return {
    draft,
    activation: activate ? recipeSchema.parse({
      product_id: input.product_id, size_id: input.size_id, action: "activate",
      operation_id: crypto.randomUUID(), expected_revision: revisionAfterDraft,
    }) : undefined,
    draftSaved,
    activated: false,
    revisionAfterDraft,
  };
}

/** Keep the same attempt after an error: operation IDs make uncertain responses safe to retry. */
export async function saveRecipeAttempt(
  attempt: RecipeSaveAttempt,
  write: (payload: RecipePayload) => Promise<unknown>,
  onStage: (stage: "draft" | "activate") => void = () => {},
) {
  if (!attempt.draftSaved) {
    onStage("draft");
    await write(attempt.draft);
    attempt.draftSaved = true;
  }
  if (attempt.activation && !attempt.activated) {
    onStage("activate");
    await write(attempt.activation);
    attempt.activated = true;
  }
}
