"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "../lib/Logo";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setError("Invalid email or password.");
        return;
      }
      router.push(params.get("next") ?? "/dashboard");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-brand-panel">
        <a href="/" style={{ display: "inline-flex" }}>
          <Logo size={26} />
        </a>
        <div>
          <blockquote>
            &ldquo;Nothing gets missed. That&apos;s all we set out to build.&rdquo;
          </blockquote>
          <p className="meta">Glucoalarm, glucose alerts that reach you before it&apos;s urgent</p>
        </div>
      </div>

      <div className="auth-form-panel">
        <div>
          <h1>Log in</h1>
          <p className="meta">Welcome back. Enter your account details.</p>
          <form onSubmit={onSubmit}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? "Logging in..." : "Log in"}
            </button>
            {error && <p className="meta">{error}</p>}
          </form>
          <p className="meta" style={{ marginTop: "1.5rem" }}>
            New here? <a href="/signup">Start your 7-day free trial</a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
