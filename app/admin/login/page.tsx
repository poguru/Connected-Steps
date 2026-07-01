"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Card, Button, Input, Label, Alert, Badge } from "@/components/ui/ds";

function AdminLoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res  = await fetch("/api/admin/auth", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Login failed"); return; }
      const redirect = searchParams.get("redirect") ?? "/admin";
      router.push(redirect);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 380, padding: "0 24px" }}>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 36 }}>
          <Image src="/logo.png" alt="Connected Steps" width={56} height={56} style={{ borderRadius: "50%", marginBottom: 14 }} />
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>Connected Steps</div>
          <Badge color="orange" style={{ marginTop: 6 }}>Admin Portal</Badge>
        </div>

        <Card>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="admin@connectedsteps.in" /></div>
            <div><Label>Password</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" onKeyDown={e => e.key === "Enter" && handleSubmit(e as unknown as React.FormEvent)} /></div>
            {error && <Alert variant="error">{error}</Alert>}
            <Button type="submit" loading={loading} fullWidth style={{ marginTop: 4 }}>Sign In →</Button>
          </form>
        </Card>

        <div style={{ marginTop: 28, textAlign: "center" }}>
          <Link href="/coach/login" style={{ fontSize: 12, color: "#333", textDecoration: "none" }}>
            Coach? Sign in here →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginForm />
    </Suspense>
  );
}
