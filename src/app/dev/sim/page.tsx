import { notFound } from "next/navigation";
import { DevSimulator } from "@/components/simulator/DevSimulator";

/** 개발 전용: Supabase 없이 합성 욕실 + 샘플 타일로 시뮬레이터를 테스트한다 (프로덕션 404) */
export default function DevSimPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DevSimulator />;
}
