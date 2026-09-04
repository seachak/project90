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
