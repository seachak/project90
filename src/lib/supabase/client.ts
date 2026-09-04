import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { getSupabaseEnv } from "@/lib/env";

export type BrowserSupabaseClient = ReturnType<typeof createBrowserClient<Database>>;

let browserClient: BrowserSupabaseClient | undefined;

/**
 * 브라우저용 Supabase 클라이언트 (싱글턴).
 * 클라이언트 컴포넌트/스토어에서 사용한다.
 */
export function createClient(): BrowserSupabaseClient {
  if (browserClient) return browserClient;
  const { url, anonKey } = getSupabaseEnv();
  browserClient = createBrowserClient<Database>(url, anonKey);
  return browserClient;
}
