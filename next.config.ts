import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : "jxmwamgfgqqsedhjvpwn.supabase.co";
  } catch {
    return "jxmwamgfgqqsedhjvpwn.supabase.co";
  }
})();

const nextConfig: NextConfig = {
  // 개발 서버가 켜진 상태에서 빌드 검증을 할 때 .next 를 덮어쓰지 않도록 분리 가능
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/**",
      },
    ],
  },
  // sharp 는 네이티브 모듈이므로 서버 번들에서 제외
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
