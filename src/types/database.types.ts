/**
 * Supabase 데이터베이스 타입.
 *
 * `supabase gen types typescript` 출력과 동일한 형식으로 작성되어 있다.
 * 스키마가 바뀌면 `pnpm db:types` 로 다시 생성한다 (supabase login 필요).
 * 기준 마이그레이션: supabase/migrations/0001_init.sql
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      materials: {
        Row: {
          id: string;
          kind: Database["public"]["Enums"]["material_kind"];
          name: string;
          brand: string | null;
          model_code: string | null;
          texture_url: string | null;
          thumbnail_url: string | null;
          tile_width_mm: number | null;
          tile_height_mm: number | null;
          is_seamless: boolean | null;
          grout_color: string | null;
          grout_width_mm: number | null;
          cutout_url: string | null;
          anchor_x: number | null;
          anchor_y: number | null;
          real_width_mm: number | null;
          real_height_mm: number | null;
          real_depth_mm: number | null;
          mount_type: string | null;
          finish: string | null;
          gloss: number | null;
          base_color: string | null;
          price: number | null;
          currency: string | null;
          tags: string[] | null;
          meta: Json | null;
          owner_id: string | null;
          is_public: boolean | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          kind: Database["public"]["Enums"]["material_kind"];
          name: string;
          brand?: string | null;
          model_code?: string | null;
          texture_url?: string | null;
          thumbnail_url?: string | null;
          tile_width_mm?: number | null;
          tile_height_mm?: number | null;
          is_seamless?: boolean | null;
          grout_color?: string | null;
          grout_width_mm?: number | null;
          cutout_url?: string | null;
          anchor_x?: number | null;
          anchor_y?: number | null;
          real_width_mm?: number | null;
          real_height_mm?: number | null;
          real_depth_mm?: number | null;
          mount_type?: string | null;
          finish?: string | null;
          gloss?: number | null;
          base_color?: string | null;
          price?: number | null;
          currency?: string | null;
          tags?: string[] | null;
          meta?: Json | null;
          owner_id?: string | null;
          is_public?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          kind?: Database["public"]["Enums"]["material_kind"];
          name?: string;
          brand?: string | null;
          model_code?: string | null;
          texture_url?: string | null;
          thumbnail_url?: string | null;
          tile_width_mm?: number | null;
          tile_height_mm?: number | null;
          is_seamless?: boolean | null;
          grout_color?: string | null;
          grout_width_mm?: number | null;
          cutout_url?: string | null;
          anchor_x?: number | null;
          anchor_y?: number | null;
          real_width_mm?: number | null;
          real_height_mm?: number | null;
          real_depth_mm?: number | null;
          mount_type?: string | null;
          finish?: string | null;
          gloss?: number | null;
          base_color?: string | null;
          price?: number | null;
          currency?: string | null;
          tags?: string[] | null;
          meta?: Json | null;
          owner_id?: string | null;
          is_public?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          name: string;
          client_name: string | null;
          address: string | null;
          before_url: string | null;
          after_url: string | null;
          base_url: string | null;
          width_px: number | null;
          height_px: number | null;
          camera: Json | null;
          owner_id: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          client_name?: string | null;
          address?: string | null;
          before_url?: string | null;
          after_url?: string | null;
          base_url?: string | null;
          width_px?: number | null;
          height_px?: number | null;
          camera?: Json | null;
          owner_id?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          client_name?: string | null;
          address?: string | null;
          before_url?: string | null;
          after_url?: string | null;
          base_url?: string | null;
          width_px?: number | null;
          height_px?: number | null;
          camera?: Json | null;
          owner_id?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      surfaces: {
        Row: {
          id: string;
          project_id: string;
          label: string;
          surface_type: string;
          polygon: Json;
          quad: Json;
          real_width_mm: number | null;
          real_height_mm: number | null;
          shading_url: string | null;
          z_order: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          label: string;
          surface_type: string;
          polygon: Json;
          quad: Json;
          real_width_mm?: number | null;
          real_height_mm?: number | null;
          shading_url?: string | null;
          z_order?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          project_id?: string;
          label?: string;
          surface_type?: string;
          polygon?: Json;
          quad?: Json;
          real_width_mm?: number | null;
          real_height_mm?: number | null;
          shading_url?: string | null;
          z_order?: number | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "surfaces_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      placements: {
        Row: {
          id: string;
          project_id: string;
          material_id: string;
          surface_id: string | null;
          pos_x: number | null;
          pos_y: number | null;
          scale: number | null;
          rotation: number | null;
          flip_x: boolean | null;
          pattern: string | null;
          offset_x_mm: number | null;
          offset_y_mm: number | null;
          rotate_deg: number | null;
          grout_override: string | null;
          z_order: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          material_id: string;
          surface_id?: string | null;
          pos_x?: number | null;
          pos_y?: number | null;
          scale?: number | null;
          rotation?: number | null;
          flip_x?: boolean | null;
          pattern?: string | null;
          offset_x_mm?: number | null;
          offset_y_mm?: number | null;
          rotate_deg?: number | null;
          grout_override?: string | null;
          z_order?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          project_id?: string;
          material_id?: string;
          surface_id?: string | null;
          pos_x?: number | null;
          pos_y?: number | null;
          scale?: number | null;
          rotation?: number | null;
          flip_x?: boolean | null;
          pattern?: string | null;
          offset_x_mm?: number | null;
          offset_y_mm?: number | null;
          rotate_deg?: number | null;
          grout_override?: string | null;
          z_order?: number | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "placements_material_id_fkey";
            columns: ["material_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "placements_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "placements_surface_id_fkey";
            columns: ["surface_id"];
            isOneToOne: false;
            referencedRelation: "surfaces";
            referencedColumns: ["id"];
          },
        ];
      };
      scene_settings: {
        Row: {
          project_id: string;
          brightness: number | null;
          contrast: number | null;
          saturation: number | null;
          temperature: number | null;
          tint: number | null;
          exposure: number | null;
          shadow_lift: number | null;
          light_preset: string | null;
          vignette: number | null;
          updated_at: string | null;
        };
        Insert: {
          project_id: string;
          brightness?: number | null;
          contrast?: number | null;
          saturation?: number | null;
          temperature?: number | null;
          tint?: number | null;
          exposure?: number | null;
          shadow_lift?: number | null;
          light_preset?: string | null;
          vignette?: number | null;
          updated_at?: string | null;
        };
        Update: {
          project_id?: string;
          brightness?: number | null;
          contrast?: number | null;
          saturation?: number | null;
          temperature?: number | null;
          tint?: number | null;
          exposure?: number | null;
          shadow_lift?: number | null;
          light_preset?: string | null;
          vignette?: number | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "scene_settings_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: true;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      snapshots: {
        Row: {
          id: string;
          project_id: string;
          title: string | null;
          image_url: string | null;
          state: Json;
          share_token: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          title?: string | null;
          image_url?: string | null;
          state: Json;
          share_token?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          project_id?: string;
          title?: string | null;
          image_url?: string | null;
          state?: Json;
          share_token?: string | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "snapshots_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_shared_snapshot: {
        Args: { p_token: string };
        Returns: {
          id: string;
          title: string | null;
          image_url: string | null;
          state: Json;
          created_at: string | null;
          project_name: string;
          width_px: number | null;
          height_px: number | null;
        }[];
      };
    };
    Enums: {
      material_kind:
        | "tile_floor"
        | "tile_wall"
        | "toilet"
        | "basin"
        | "bathtub"
        | "shower"
        | "faucet"
        | "accessory";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];

export const Constants = {
  public: {
    Enums: {
      material_kind: [
        "tile_floor",
        "tile_wall",
        "toilet",
        "basin",
        "bathtub",
        "shower",
        "faucet",
        "accessory",
      ],
    },
  },
} as const;
