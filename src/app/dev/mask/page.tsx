import { notFound } from "next/navigation";
import { MaskEditor } from "@/components/canvas/MaskEditor";

/**
 * 개발 전용: Supabase 없이 마스킹 에디터를 합성 욕실 사진으로 테스트한다.
 * (프로덕션 빌드에서는 404)
 */
export default function DevMaskPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <MaskEditor
      projectId="demo"
      projectName="데모 욕실"
      imageUrl="/samples/rooms/demo-bathroom.jpg"
      imageWidth={1600}
      imageHeight={1200}
      initialSurfaces={[]}
      mode="demo"
    />
  );
}
