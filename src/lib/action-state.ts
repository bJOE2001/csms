export type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
  /** Keep correctable field validation visible beside the form. */
  validation?: boolean;
};
export const initialActionState: ActionState = { status: "idle", message: "" };
