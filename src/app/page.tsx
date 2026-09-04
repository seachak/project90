import Link from "next/link";
import { ArrowRight, Columns2, Sparkles, SunMedium, Zap } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: Zap,
    title: "클릭 한 번, 즉시 시공",
    description:
      "AI 생성이 아닌 캔버스 합성. 자재를 클릭하면 16ms 안에 화면이 바뀌고, 같은 입력이면 항상 같은 결과가 나옵니다.",
  },
  {
    icon: Columns2,
    title: "Before / After 비교",
    description:
      "버튼 토글, 슬라이더, 분할 보기 세 가지 모드. 스페이스바를 누르고 있는 동안 원본을 확인할 수 있습니다.",
  },
  {
    icon: SunMedium,
    title: "조명·채도 보정",
    description:
      "전구색·주광색·야간·쇼룸 프리셋과 색온도·노출 슬라이더로 실제 현장 분위기에 맞춥니다.",
  },
  {
    icon: Sparkles,
    title: "자연스러운 위생도기 배치",
    description:
      "바닥 원근에 맞춰 자동으로 크기가 조정되고, 접지 그림자와 조명 정합으로 붙여넣은 티가 나지 않습니다.",
  },
];

export default function HomePage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
        <section className="max-w-3xl">
          <p className="mb-3 text-sm font-medium text-muted-foreground">
            욕실·주방 리모델링 자재 시뮬레이터
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            시공 전 사진 위에
            <br />
            실제 판매 자재를 입혀 보세요
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            현장 사진의 벽과 바닥을 지정하면, 타일·양변기·세면기·욕조·수전을 실시간으로 올려 보고
            바로 비교할 수 있습니다. 영업 현장에서도, 고객 상담에서도 클릭 한 번이면 충분합니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/projects" className={cn(buttonVariants({ size: "lg" }))}>
              시작하기
              <ArrowRight className="size-4" data-icon="inline-end" />
            </Link>
            <Link
              href="/materials"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
            >
              자재 라이브러리
            </Link>
          </div>
        </section>

        <section className="mt-20 grid gap-4 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <Card key={title}>
              <CardHeader>
                <div className="mb-2 inline-flex size-9 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-4" />
                </div>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          ))}
        </section>
      </main>
      <footer className="border-t px-6 py-8 text-center text-xs text-muted-foreground">
        project90 · 캔버스 기반 실시간 마스크 합성 · 단위 mm · 면적 ㎡/평 병기
      </footer>
    </>
  );
}
