import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";
import { getSupabaseEnv } from "@/lib/env";

/**
 * 서버 컴포넌트 / Route Handler / Server Action 용 Supabase 클라이언트.
 * 요청 쿠키의 세션을 사용하므로 RLS 가 로그인 사용자 기준으로 적용된다.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // 서버 컴포넌트에서 호출된 경우 쿠키를 쓸 수 없다.
          // middleware 가 세션을 갱신하므로 무시해도 된다.
        }
      },
    },
  });
}

/**
 * service_role 클라이언트 — API Route / Server Action 전용.
 * RLS 를 우회하므로 브라우저에 절대 노출하지 말 것.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다 (.env.local).");
  }
  return createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
