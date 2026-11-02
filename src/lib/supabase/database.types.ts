// Maintained alongside the SQL migrations. Numeric estimates are selected as text
// in application queries so JSON number parsing cannot lose decimal precision.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type Table<Row, Relationships extends Array<{ foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[] }> = []> = {
  Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: Relationships;
};
type Scoped = { id: string; shop_id: string };
export type Category = Scoped & { name: string; created_at: string };
export type Product = Scoped & { name: string; category_id: string; created_at: string };
export type Variant = Scoped & { name: string; product_id: string; available: boolean; created_at: string };
export type Price = Scoped & { variant_id: string; version: number; price_cents: number; created_by: string; effective_at: string };
export type Ingredient = Scoped & { name: string; base_unit: "g" | "ml" | "each"; estimated_unit_cost_cents: number | null; minimum_stock: number; created_at: string };
export type Recipe = Scoped & { variant_id: string; version: number; cost_status: "estimated" | "unavailable"; estimated_cost_cents: number | null; created_by: string; effective_at: string };
export type RecipeItem = Scoped & { recipe_id: string; ingredient_id: string; ingredient_name_snapshot: string; base_unit_snapshot: Ingredient["base_unit"]; quantity: number; waste_bps: number; estimated_unit_cost_cents: number | null };
export type Shop = { id: string; name: string; currency_code: string; timezone: string; setup_state: "pre_opening" | "operating"; created_by: string; created_at: string; updated_at: string };

export type Database = {
  public: {
    Tables: {
      shops: Table<Shop>;
      profiles: Table<{ user_id: string; display_name: string | null; created_at: string; updated_at: string }>;
      shop_members: Table<Scoped & { user_id: string; role: "founder" | "staff"; status: "active" | "invited" | "suspended"; created_at: string }, [{ foreignKeyName: "shop_members_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] }]>;
      pos_devices: Table<Scoped & { name: string; offline_capable: boolean; enabled: boolean; created_at: string }>;
      categories: Table<Category>;
      products: Table<Product>;
      product_variants: Table<Variant>;
      product_prices: Table<Price>;
      ingredients: Table<Ingredient>;
      recipes: Table<Recipe>;
      recipe_items: Table<RecipeItem>;
      audit_logs: Table<Scoped & { actor_id: string | null; action: string; entity_type: string; entity_id: string; context: Json; created_at: string }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      create_membership_invite: { Args: { p_shop_id:string; p_email:string; p_role:"founder"|"staff" }; Returns:string };
      accept_membership_invite: { Args: { p_token:string }; Returns:string };
      revoke_membership_invite: { Args: { p_shop_id:string; p_id:string }; Returns:undefined };
      manage_inventory: { Args: { p_shop_id: string; p_action: string; p_data: Json; p_operation_id: string }; Returns: Json };
      manage_finance: { Args: { p_shop_id: string; p_action: string; p_data: Json; p_operation_id: string }; Returns: Json };
      manage_settings: { Args: { p_shop_id: string; p_action: string; p_data: Json; p_operation_id: string }; Returns: Json };
      manage_order: { Args: { p_shop_id: string; p_action: string; p_data: Json; p_operation_id: string }; Returns: Json };
      close_cashier_shift: { Args: { p_shop_id: string; p_data: Json; p_operation_id: string }; Returns: Json };
      review_cashier_shift: { Args: { p_shop_id: string; p_data: Json; p_operation_id: string }; Returns: Json };
      process_order: { Args: { p_shop_id: string; p_payload: Json; p_operation_id: string; p_recovery_reason?: string }; Returns: Json };
      open_pos_session: { Args: { p_shop_id: string; p_device_id: string; p_shift_id: string; p_browser_key?:string;p_last_sequence?:number }; Returns: Json };
      pair_pos_device: { Args: { p_shop_id:string; p_device_id:string; p_browser_key:string }; Returns:undefined };
      workspace_dashboard: { Args:{p_shop_id:string}; Returns:Json };
      get_business_data: { Args: { p_shop_id: string; p_module: string; p_page?: number }; Returns: Json };
      business_report: { Args: { p_shop_id: string; p_start: string; p_end: string }; Returns: Json };
      create_shop: { Args: { shop_name: string; shop_timezone?: string }; Returns: string };
      is_shop_member: { Args: { target_shop_id: string }; Returns: boolean };
      is_shop_founder: { Args: { target_shop_id: string }; Returns: boolean };
      create_menu_category: { Args: { p_shop_id: string; p_name: string }; Returns: string };
      create_menu_product: { Args: { p_shop_id: string; p_category_id: string; p_name: string; p_variant_name: string; p_price_cents: number }; Returns: string };
      add_menu_variant: { Args: { p_shop_id: string; p_product_id: string; p_name: string; p_price_cents: number }; Returns: string };
      publish_product_price: { Args: { p_shop_id: string; p_variant_id: string; p_price_cents: number }; Returns: string };
      create_ingredient: { Args: { p_shop_id: string; p_name: string; p_base_unit: Ingredient["base_unit"]; p_estimated_unit_cost_cents: string | null; p_minimum_stock: string }; Returns: string };
      revise_ingredient_estimate: { Args: { p_shop_id: string; p_ingredient_id: string; p_estimated_unit_cost_cents: string | null }; Returns: undefined };
      publish_recipe: { Args: { p_shop_id: string; p_variant_id: string; p_items: Json }; Returns: string };
      set_variant_available: { Args: { p_shop_id: string; p_variant_id: string; p_available: boolean }; Returns: undefined };
    };
    Enums: {
      shop_setup_state: Shop["setup_state"];
      shop_member_role: "founder" | "staff";
      shop_member_status: "active" | "invited" | "suspended";
      ingredient_unit: Ingredient["base_unit"];
      recipe_cost_status: Recipe["cost_status"];
    };
    CompositeTypes: { [_ in never]: never };
  };
};
