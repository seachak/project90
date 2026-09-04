"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Status = "idle" | "sending" | "sent" | "oauth";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.97 6.97 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/projects";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(searchParams.get("error"));

  const callbackUrl = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus("sending");
    try {
      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: callbackUrl() },
      });
      if (otpError) throw otpError;
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인 링크를 보내지 못했습니다.");
      setStatus("idle");
    }
  }

  async function signInWithGoogle() {
    setError(null);
    setStatus("oauth");
    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl() },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google 로그인을 시작하지 못했습니다.");
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <MailCheck className="mb-2 size-8 text-primary" />
          <CardTitle>메일함을 확인해 주세요</CardTitle>
          <CardDescription>
            <span className="font-medium text-foreground">{email}</span> 로 로그인 링크를
            보냈습니다. 링크를 열면 바로 로그인됩니다.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="ghost" size="sm" onClick={() => setStatus("idle")}>
            다른 이메일로 받기
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const busy = status === "sending" || status === "oauth";

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>로그인</CardTitle>
        <CardDescription>비밀번호 없이 이메일 링크 또는 Google 계정으로 로그인합니다.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>로그인 오류</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
            />
          </div>
          <Button type="submit" disabled={busy || email.length === 0}>
            {status === "sending" && <Loader2 className="size-4 animate-spin" />}
            로그인 링크 받기
          </Button>
        </form>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          또는
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button type="button" variant="outline" onClick={signInWithGoogle} disabled={busy}>
          {status === "oauth" ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
          Google 계정으로 계속하기
        </Button>
      </CardContent>
    </Card>
  );
}
