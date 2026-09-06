/**
 * 환경변수 접근 헬퍼.
 * 빌드 시점에는 값이 없을 수 있으므로, 실제 사용 시점에만 검증한다.
 */
export function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase 환경변수가 없습니다. .env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 NEXT_PUBLIC_SUPABASE_ANON_KEY 를 설정하세요 (.env.local.example 참고).",
    );
  }
  return { url, anonKey };
}

export function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * 게스트 자재 등록 — 로그인 없이 `/materials` 에 자재를 올릴 수 있게 한다.
 *
 * ⚠️ 켜면 그 배포본을 아는 사람은 누구나 자재를 등록할 수 있다.
 *    RLS 는 그대로 두고 서버 라우트(service_role)에서만 우회하므로 DB 정책은 안전하지만,
 *    공개 주소에 켜 두면 사실상 열린 업로드 엔드포인트가 된다.
 *    로컬에서 임시로 써 보는 용도이며 기본값은 꺼짐이다.
 */
export function isGuestMaterialsEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_GUEST_MATERIALS;
  return v === "1" || v === "true";
}

/** 서버에서 절대 URL 이 필요할 때 (이메일 링크 등) */
export function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}
