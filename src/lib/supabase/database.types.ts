export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
type Table<
  Row,
  Relationships extends {
    foreignKeyName: string;
    columns: string[];
    isOneToOne: boolean;
    referencedRelation: string;
    referencedColumns: string[];
  }[] = [],
> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: Relationships;
};
type Shop = { id: string; name: string; timezone: string };
export type Database = {
  public: {
    Tables: {
      shops: Table<Shop>;
      shop_members: Table<
        {
          id: string;
          shop_id: string;
          user_id: string;
          role: "founder" | "staff";
          status: string;
          created_at: string;
        },
        [
          {
            foreignKeyName: "shop_members_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ]
      >;
      pos_products: Table<{
        id: string;
        shop_id: string;
        name: string;
        price_cents: number;
        cost_cents: number | null;
        active: boolean;
        category_id: string | null;
        description: string;
        image_url: string | null;
        sizes: Json;
        archived_at: string | null;
      }>;
      pos_categories: Table<{ id: string; shop_id: string; name: string }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      pos_save_category: {
        Args: { p_shop_id: string; p_data: Json };
        Returns: Json;
      };
      pos_delete_category: {
        Args: { p_shop_id: string; p_id: string };
        Returns: undefined;
      };
      pos_archive_product: {
        Args: { p_shop_id: string; p_id: string };
        Returns: undefined;
      };
      pos_record_cost: {
        Args: { p_shop_id: string; p_data: Json };
        Returns: undefined;
      };
      pos_add_expense: {
        Args: { p_shop_id: string; p_data: Json };
        Returns: Json;
      };
      pos_update_expense: {
        Args: { p_shop_id: string; p_data: Json };
        Returns: Json;
      };
      pos_void_expense: {
        Args: { p_shop_id: string; p_id: string };
        Returns: undefined;
      };
      pos_expenses: {
        Args: { p_shop_id: string; p_from: string; p_to: string };
        Returns: Json;
      };
      create_shop: {
        Args: { shop_name: string; shop_timezone: string };
        Returns: string;
      };
      pos_save_product: {
        Args: { p_shop_id: string; p_data: Json };
        Returns: Json;
      };
      pos_checkout: {
        Args: { p_shop_id: string; p_data: Json };
        Returns: Json;
      };
      pos_refund: {
        Args: { p_shop_id: string; p_sale_id: string; p_reason: string };
        Returns: undefined;
      };
      pos_sales: {
        Args: { p_shop_id: string; p_from: string; p_to: string };
        Returns: Json;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
