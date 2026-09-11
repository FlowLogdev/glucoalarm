import { hashPassword } from "./lib/password";
import { sendEmail } from "./lib/resend";
import type { Env } from "./types";
import type { Admin } from "./auth";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

/**
 * A doctor invite is a full admin account scoped to the inviting customer's
 * customer_id (same ownership-guard columns every other route already
 * checks), with role='doctor' so write routes can reject it -- see
 * requireWriteAccess() in api.ts. Only the customer who invites a doctor
 * can revoke them; doctors never see any customer besides the one(s) that
 * explicitly invited them.
 */
export async function postDoctorInvite(env: Env, admin: Admin, request: Request, now: number): Promise<Response> {
  if (admin.role === "doctor") return jsonResponse({ error: "forbidden" }, 403);
  if (!admin.customer_id) return jsonResponse({ error: "no_customer_account" }, 400);

  const body = await request.json<{ email?: string; name?: string }>();
  if (!body.email?.trim() || !EMAIL_RE.test(body.email.trim())) {
    return jsonResponse({ error: "a valid email is required" }, 400);
  }
  const email = body.email.toLowerCase().trim();

  const existing = await env.DB.prepare(`SELECT id FROM admins WHERE email = ?`).bind(email).first();
  if (existing) return jsonResponse({ error: "email_already_registered" }, 409);

  const person = await env.DB
    .prepare(`SELECT name FROM people WHERE customer_id = ? LIMIT 1`)
    .bind(admin.customer_id)
    .first<{ name: string }>();

  const password = randomPassword();
  const passwordHash = await hashPassword(password);
  const doctorId = crypto.randomUUID();

  await env.DB
    .prepare(`INSERT INTO admins (id, email, password_hash, is_super_admin, customer_id, role, created_at) VALUES (?, ?, ?, 0, ?, 'doctor', ?)`)
    .bind(doctorId, email, passwordHash, admin.customer_id, now)
    .run();

  try {
    await sendEmail(
      env,
      email,
      "You've been invited to Glucoalarm",
      `<p>Hi ${body.name?.trim() || "there"},</p>
       <p>You've been given read-only access to ${person?.name ?? "a patient"}'s glucose monitoring data on Glucoalarm.</p>
       <p>Log in at <a href="https://glucoalarm.com/login">glucoalarm.com/login</a> with:</p>
       <p>Email: ${email}<br>Temporary password: <strong>${password}</strong></p>
       <p>You'll be able to view readings, reports, and download data as CSV. You won't be able to change any settings or billing.</p>`
    );
  } catch (err) {
    console.error(`postDoctorInvite: email send failed for ${email}:`, err);
  }

  return jsonResponse({ id: doctorId, email }, 201);
}

export async function getDoctors(env: Env, admin: Admin): Promise<Response> {
  if (admin.role === "doctor") return jsonResponse({ error: "forbidden" }, 403);
  if (!admin.customer_id) return jsonResponse([]);

  const doctors = await env.DB
    .prepare(`SELECT id, email, created_at FROM admins WHERE customer_id = ? AND role = 'doctor' ORDER BY created_at DESC`)
    .bind(admin.customer_id)
    .all();
  return jsonResponse(doctors.results);
}

export async function deleteDoctor(env: Env, admin: Admin, doctorId: string): Promise<Response> {
  if (admin.role === "doctor") return jsonResponse({ error: "forbidden" }, 403);
  if (!admin.customer_id) return jsonResponse({ error: "no_customer_account" }, 400);

  const result = await env.DB
    .prepare(`DELETE FROM admins WHERE id = ? AND customer_id = ? AND role = 'doctor'`)
    .bind(doctorId, admin.customer_id)
    .run();
  if (result.meta.changes === 0) return jsonResponse({ error: "not_found" }, 404);

  await env.DB.prepare(`DELETE FROM auth_sessions WHERE admin_id = ?`).bind(doctorId).run();
  return jsonResponse({ ok: true });
}
