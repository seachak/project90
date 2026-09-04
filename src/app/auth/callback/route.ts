import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * 이메일 매직링크 / OAuth 콜백.
 *  - PKCE 플로우: ?code=...
 *  - 커스텀 이메일 템플릿: ?token_hash=...&type=magiclink
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/projects";
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/projects";

  const supabase = await createClient();
  let errorMessage: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    errorMessage = error?.message ?? null;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    errorMessage = error?.message ?? null;
  } else {
    errorMessage = "인증 코드가 없습니다. 로그인 링크를 다시 요청해 주세요.";
  }

  if (errorMessage) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", errorMessage);
    return NextResponse.redirect(loginUrl);
  }

  // Vercel 등 프록시 뒤에서는 x-forwarded-host 를 우선 사용
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isDev = process.env.NODE_ENV === "development";
  const base = isDev || !forwardedHost ? origin : `https://${forwardedHost}`;
  return NextResponse.redirect(`${base}${next}`);
}
