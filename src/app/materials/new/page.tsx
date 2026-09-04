import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { MaterialForm } from "@/components/materials/MaterialForm";
import { ALL_KINDS, type MaterialKind } from "@/types/material";

export const metadata: Metadata = { title: "자재 등록" };

export default async function NewMaterialPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const initialKind = (ALL_KINDS as readonly string[]).includes(kind ?? "")
    ? (kind as MaterialKind)
    : "tile_floor";
  return (
    <>
      <AppHeader />
      <main>
        <MaterialForm initialKind={initialKind} />
      </main>
    </>
  );
}
