import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv, getSupabaseEnv } from "@/lib/env";

/** 로그인이 필요한 경로 접두어 */
const PROTECTED_PREFIXES = ["/projects", "/materials"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * 매 요청마다 세션 토큰을 갱신하고, 보호 경로 접근을 제어한다.
 * (@supabase/ssr 권장 패턴)
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // 환경변수 미설정(초기 세팅 단계) 시에는 그대로 통과
  if (!hasSupabaseEnv()) return supabaseResponse;
  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // 반드시 getUser() 를 호출해야 만료된 토큰이 갱신된다.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const redirectWithCookies = (target: URL) => {
    const redirect = NextResponse.redirect(target);
    supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!user && isProtectedPath(pathname)) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "";
    target.searchParams.set("next", pathname);
    return redirectWithCookies(target);
  }

  if (user && pathname === "/login") {
    const target = request.nextUrl.clone();
    const next = request.nextUrl.searchParams.get("next");
    target.pathname = next && next.startsWith("/") && !next.startsWith("//") ? next : "/projects";
    target.search = "";
    return redirectWithCookies(target);
  }

  return supabaseResponse;
}
