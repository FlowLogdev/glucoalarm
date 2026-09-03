import { verifyPassword } from "./lib/password";
import type { Env } from "./types";

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface Admin {
  id: string;
  email: string;
  is_super_admin: number;
}

export async function login(
  env: Env,
  email: string,
  password: string,
  now: number
): Promise<{ sessionId: string; expiresAt: number } | null> {
  const admin = await env.DB
    .prepare(`SELECT id, email, password_hash FROM admins WHERE email = ?`)
    .bind(email.toLowerCase().trim())
    .first<{ id: string; email: string; password_hash: string }>();

  if (!admin) return null;
  const valid = await verifyPassword(password, admin.password_hash);
  if (!valid) return null;

  const sessionId = crypto.randomUUID();
  const expiresAt = now + SESSION_TTL_SECONDS;
  await env.DB
    .prepare(`INSERT INTO auth_sessions (id, admin_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(sessionId, admin.id, now, expiresAt)
    .run();

  return { sessionId, expiresAt };
}

export async function logout(env: Env, sessionId: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM auth_sessions WHERE id = ?`).bind(sessionId).run();
}

export async function getSessionAdmin(env: Env, sessionId: string, now: number): Promise<Admin | null> {
  const row = await env.DB
    .prepare(
      `SELECT admins.id as id, admins.email as email, admins.is_super_admin as is_super_admin, auth_sessions.expires_at as expires_at
       FROM auth_sessions JOIN admins ON admins.id = auth_sessions.admin_id
       WHERE auth_sessions.id = ?`
    )
    .bind(sessionId)
    .first<Admin & { expires_at: number }>();

  if (!row || row.expires_at < now) return null;
  return { id: row.id, email: row.email, is_super_admin: row.is_super_admin };
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}
