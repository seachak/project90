"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useUser } from "@/hooks/use-user";
import { CSV_TEMPLATE, parseMaterialRows, type ParsedMaterials } from "@/lib/materials/csv";
import { readSpreadsheetFile } from "@/lib/materials/importFile";
import { createClient } from "@/lib/supabase/client";
import { KIND_LABELS } from "@/types/material";

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (count: number) => void;
}

const CHUNK = 100;

export function BulkImportDialog({ open, onOpenChange, onImported }: BulkImportDialogProps) {
  const { user } = useUser();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedMaterials | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const templateUrl = useMemo(() => {
    if (typeof window === "undefined") return null;
    return URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" }));
  }, []);
  useEffect(() => () => {
    if (templateUrl) URL.revokeObjectURL(templateUrl);
  }, [templateUrl]);

  useEffect(() => {
    if (!open) {
      setFileName(null);
      setParsed(null);
      setError(null);
      setProgress(0);
    }
  }, [open]);

  async function handleFile(file: File) {
    if (!user) return;
    setParsing(true);
    setError(null);
    setFileName(file.name);
    try {
      const rows = await readSpreadsheetFile(file);
      setParsed(parseMaterialRows(rows, { owner_id: user.id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "파일을 읽지 못했습니다.");
      setParsed(null);
    } finally {
      setParsing(false);
    }
  }

  async function runImport() {
    if (!parsed || parsed.inserts.length === 0) return;
    setImporting(true);
    setError(null);
    const supabase = createClient();
    let done = 0;
    try {
      for (let i = 0; i < parsed.inserts.length; i += CHUNK) {
        const chunk = parsed.inserts.slice(i, i + CHUNK);
        const { error: insertError } = await supabase.from("materials").insert(chunk);
        if (insertError) throw insertError;
        done += chunk.length;
        setProgress(done / parsed.inserts.length);
      }
      onImported(done);
      onOpenChange(false);
    } catch (err) {
      setError(
        `${done}개 등록 후 오류: ${err instanceof Error ? err.message : "알 수 없는 오류"}`,
      );
    } finally {
      setImporting(false);
    }
  }

  const preview = parsed?.inserts.slice(0, 8) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>CSV / 엑셀 일괄 등록</DialogTitle>
          <DialogDescription>
            헤더는 한국어·영어 모두 인식합니다 (종류, 이름, 브랜드, 이미지URL, 가로mm, 세로mm, 마감, 가격, 태그 …).
            이미지 URL 은 그대로 저장되며, 외부 URL 도 사용할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 hover:bg-muted">
              <FileSpreadsheet className="size-4" />
              {fileName ?? "파일 선택 (.csv, .xlsx)"}
              <input
                type="file"
                accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                disabled={parsing || importing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            {templateUrl && (
              <a
                href={templateUrl}
                download="materials-template.csv"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                <Download className="size-3.5" />
                템플릿 CSV 내려받기
              </a>
            )}
            {parsing && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>오류</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {parsed && (
            <>
              <p>
                <span className="font-medium">{parsed.inserts.length}개</span> 행을 등록할 수 있습니다.
                {parsed.errors.length > 0 && (
                  <span className="text-destructive"> {parsed.errors.length}개 행은 건너뜁니다.</span>
                )}
              </p>
              {parsed.errors.length > 0 && (
                <ul className="max-h-24 overflow-auto rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
                  {parsed.errors.slice(0, 20).map((e) => (
                    <li key={e.row}>
                      {e.row}행: {e.message}
                    </li>
                  ))}
                </ul>
              )}
              {preview.length > 0 && (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60 text-left">
                      <tr>
                        <th className="p-2">종류</th>
                        <th className="p-2">이름</th>
                        <th className="p-2">브랜드</th>
                        <th className="p-2">규격</th>
                        <th className="p-2">가격</th>
                        <th className="p-2">이미지</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((m, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{KIND_LABELS[m.kind]}</td>
                          <td className="p-2">{m.name}</td>
                          <td className="p-2">{m.brand ?? ""}</td>
                          <td className="p-2">
                            {m.tile_width_mm
                              ? `${m.tile_width_mm}×${m.tile_height_mm}`
                              : m.real_width_mm
                                ? `${m.real_width_mm}×${m.real_height_mm ?? "–"}×${m.real_depth_mm ?? "–"}`
                                : ""}
                          </td>
                          <td className="p-2">{m.price?.toLocaleString() ?? ""}</td>
                          <td className="max-w-40 truncate p-2 text-muted-foreground">
                            {m.texture_url ?? m.cutout_url ?? ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {importing && <Progress value={Math.round(progress * 100)} />}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            닫기
          </Button>
          <Button onClick={runImport} disabled={!parsed || parsed.inserts.length === 0 || importing}>
            {importing && <Loader2 className="size-4 animate-spin" />}
            {parsed ? `${parsed.inserts.length}개 등록` : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
