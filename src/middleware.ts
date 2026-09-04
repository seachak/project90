import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 정적 파일·이미지·샘플 자산은 제외하고 모든 경로에서 세션 갱신
     */
    "/((?!_next/static|_next/image|favicon.ico|samples/|models/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wasm|onnx|json)$).*)",
  ],
};
