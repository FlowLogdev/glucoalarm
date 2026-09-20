import { sendEmail } from "./lib/resend";
import type { Env } from "./types";
import type { Admin } from "./auth";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

const MAX_DESCRIPTION_LENGTH = 5000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

/**
 * Ticket numbers look like Gluco-2000-09152026 (sequence-MMDDYYYY). Each
 * calendar day's sequence starts at 2000 and is atomically incremented, so
 * the number shown to a customer is readable and still unique.
 */
async function generateTicketNumber(env: Env, now: number): Promise<string> {
  const date = new Date(now * 1000);
  const year = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const dateKey = `${year}-${mm}-${dd}`;

  const row = await env.DB
    .prepare(
      `INSERT INTO support_ticket_daily_sequence (date_key, next_number) VALUES (?, 2001)
       ON CONFLICT(date_key) DO UPDATE SET next_number = support_ticket_daily_sequence.next_number + 1
       RETURNING next_number - 1 AS assigned`
    )
    .bind(dateKey)
    .first<{ assigned: number }>();

  return `Gluco-${row!.assigned}-${mm}${dd}${year}`;
}

/**
 * Public ticket submission -- no account required. Guest tickets use the
 * sentinel customer_id/admin_id 'guest' rather than a schema change to make
 * those columns nullable; they're only visible to super-admins (same rule
 * that already applies to any ticket whose customer_id doesn't match the
 * viewer). Email delivery is best-effort: a Resend outage or missing API
 * key must not block ticket creation itself.
 */
export async function postPublicTicket(env: Env, request: Request, now: number): Promise<Response> {
  const body = await request.json<{
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    subject?: string;
    description?: string;
  }>();
  const { first_name, last_name, email, subject, description } = body;

  if (!first_name?.trim() || !last_name?.trim() || !email?.trim() || !subject?.trim() || !description?.trim()) {
    return jsonResponse({ error: "first_name, last_name, email, subject, and description are required" }, 400);
  }
  if (!EMAIL_RE.test(email.trim())) {
    return jsonResponse({ error: "invalid email address" }, 400);
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return jsonResponse({ error: `description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer` }, 400);
  }

  const ticketNumber = await generateTicketNumber(env, now);
  const phone = body.phone?.trim() || null;

  const result = await env.DB
    .prepare(
      `INSERT INTO support_tickets (customer_id, admin_id, subject, status, ticket_number, first_name, last_name, email, phone, created_at, updated_at)
       VALUES ('guest', 'guest', ?, 'open', ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(subject.trim(), ticketNumber, first_name.trim(), last_name.trim(), email.trim(), phone, now, now)
    .run();
  const ticketId = result.meta.last_row_id;

  await env.DB
    .prepare(`INSERT INTO support_ticket_messages (ticket_id, admin_id, is_staff, body, created_at) VALUES (?, NULL, 0, ?, ?)`)
    .bind(ticketId, description.trim(), now)
    .run();

  try {
    const escapedDescription = escapeHtml(description.trim());
    await sendEmail(
      env,
      email.trim(),
      `We received your ticket ${ticketNumber}`,
      `<p>Hi ${first_name.trim()},</p>
       <p>Thanks for reaching out to Glucoalarm support. Your ticket number is <strong>${ticketNumber}</strong>.</p>
       <p><strong>Subject:</strong> ${subject.trim()}</p>
       <p><strong>Your message:</strong><br>${escapedDescription}</p>
       <p>Our support team will reply to this email within 24 hours.</p>`
    );
    await sendEmail(
      env,
      "support@flowlog.dev",
      `New ticket ${ticketNumber}: ${subject.trim()}`,
      `<p>New support ticket from ${first_name.trim()} ${last_name.trim()} (${email.trim()}${phone ? `, ${phone}` : ""}).</p>
       <p><strong>Subject:</strong> ${subject.trim()}</p>
       <p><strong>Message:</strong><br>${escapedDescription}</p>`
    );
  } catch (err) {
    console.error(`postPublicTicket: email send failed for ${ticketNumber}:`, err);
  }

  return jsonResponse({ ticket_number: ticketNumber }, 201);
}

interface TicketRow {
  id: number;
  customer_id: string;
  admin_id: string;
  subject: string;
  status: string;
  created_at: number;
  updated_at: number;
  ticket_number: string | null;
  email: string | null;
}

function ticketLabel(ticket: Pick<TicketRow, "id" | "ticket_number">): string {
  return ticket.ticket_number ?? `Ticket #${ticket.id}`;
}

async function notifySupport(env: Env, ticket: TicketRow, event: string, html: string): Promise<void> {
  try {
    await sendEmail(env, "support@flowlog.dev", `${event}: ${ticketLabel(ticket)} — ${ticket.subject}`, html);
  } catch (err) {
    console.error(`support notification failed for ${ticketLabel(ticket)}:`, err);
  }
}

async function assertOwnsTicket(env: Env, admin: Admin, ticketId: string): Promise<TicketRow | null> {
  const ticket = await env.DB.prepare(`SELECT * FROM support_tickets WHERE id = ?`).bind(ticketId).first<TicketRow>();
  if (!ticket) return null;
  if (!admin.is_super_admin && ticket.customer_id !== admin.customer_id) return null;
  return ticket;
}

/** Super-admins (support staff) see every customer's tickets for triage; everyone else sees only their own. */
export async function getTickets(env: Env, admin: Admin): Promise<Response> {
  const tickets = admin.is_super_admin
    ? await env.DB.prepare(`SELECT * FROM support_tickets ORDER BY updated_at DESC`).all<TicketRow>()
    : await env.DB
        .prepare(`SELECT * FROM support_tickets WHERE customer_id = ? ORDER BY updated_at DESC`)
        .bind(admin.customer_id)
        .all<TicketRow>();
  return jsonResponse(tickets.results);
}

export async function getTicket(env: Env, admin: Admin, ticketId: string): Promise<Response> {
  const ticket = await assertOwnsTicket(env, admin, ticketId);
  if (!ticket) return jsonResponse({ error: "not_found" }, 404);
  const messages = await env.DB
    .prepare(`SELECT id, is_staff, body, created_at FROM support_ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC`)
    .bind(ticketId)
    .all();
  return jsonResponse({ ticket, messages: messages.results });
}

export async function postTicket(env: Env, admin: Admin, request: Request, now: number): Promise<Response> {
  if (!admin.customer_id) return jsonResponse({ error: "no_customer_account" }, 400);
  const body = await request.json<{ subject?: string; message?: string }>();
  if (!body.subject?.trim() || !body.message?.trim()) {
    return jsonResponse({ error: "subject and message are required" }, 400);
  }

  const ticketNumber = await generateTicketNumber(env, now);
  const result = await env.DB
    .prepare(`INSERT INTO support_tickets (customer_id, admin_id, subject, status, created_at, updated_at) VALUES (?, ?, ?, 'open', ?, ?)`)
    .bind(admin.customer_id, admin.id, body.subject.trim(), now, now)
    .run();
  const ticketId = result.meta.last_row_id;

  await env.DB.prepare(`UPDATE support_tickets SET ticket_number = ?, email = ? WHERE id = ?`).bind(ticketNumber, admin.email, ticketId).run();

  await env.DB
    .prepare(`INSERT INTO support_ticket_messages (ticket_id, admin_id, is_staff, body, created_at) VALUES (?, ?, 0, ?, ?)`)
    .bind(ticketId, admin.id, body.message.trim(), now)
    .run();

  try {
    const subject = body.subject.trim();
    const message = escapeHtml(body.message.trim());
    await sendEmail(
      env,
      "support@flowlog.dev",
      `New ticket ${ticketNumber}: ${subject}`,
      `<p>New GlucoAlarm support ticket from ${admin.email}.</p><p><strong>Ticket:</strong> ${ticketNumber}</p><p><strong>Subject:</strong> ${escapeHtml(subject)}</p><p><strong>Message:</strong><br>${message}</p>`
    );
    await sendEmail(
      env,
      admin.email,
      `We received your ticket ${ticketNumber}`,
      `<p>Thanks for contacting GlucoAlarm support.</p><p>Your ticket number is <strong>${ticketNumber}</strong>.</p><p><strong>Subject:</strong> ${escapeHtml(subject)}</p><p><strong>Your message:</strong><br>${message}</p><p>Our team will reply to this email within 24 hours.</p>`
    );
  } catch (err) {
    // A ticket must remain open even if an email provider is temporarily unavailable.
    console.error(`postTicket: email send failed for ${ticketNumber}:`, err);
  }

  return jsonResponse({ id: ticketId, ticket_number: ticketNumber }, 201);
}

/** Customer edits update the original request and reopen the ticket for support. */
export async function patchCustomerTicket(env: Env, admin: Admin, ticketId: string, request: Request, now: number): Promise<Response> {
  if (admin.role === "doctor") return jsonResponse({ error: "forbidden" }, 403);
  const ticket = await assertOwnsTicket(env, admin, ticketId);
  if (!ticket) return jsonResponse({ error: "not_found" }, 404);
  const body = await request.json<{ subject?: string; message?: string }>();
  if (!body.subject?.trim() || !body.message?.trim()) return jsonResponse({ error: "subject and message are required" }, 400);

  await env.DB.prepare(`UPDATE support_tickets SET subject = ?, status = 'open', updated_at = ? WHERE id = ?`).bind(body.subject.trim(), now, ticketId).run();
  await env.DB
    .prepare(`UPDATE support_ticket_messages SET body = ?, created_at = ? WHERE id = (SELECT id FROM support_ticket_messages WHERE ticket_id = ? AND is_staff = 0 ORDER BY created_at ASC LIMIT 1)`)
    .bind(body.message.trim(), now, ticketId)
    .run();
  const updated = { ...ticket, subject: body.subject.trim(), status: "open", updated_at: now };
  await notifySupport(env, updated, "Customer updated ticket", `<p>${escapeHtml(admin.email)} updated <strong>${ticketLabel(updated)}</strong> and reopened it.</p><p><strong>Message:</strong><br>${escapeHtml(body.message.trim())}</p>`);
  return jsonResponse({ ok: true, ticket_number: ticketLabel(updated) });
}

export async function closeCustomerTicket(env: Env, admin: Admin, ticketId: string, now: number): Promise<Response> {
  if (admin.role === "doctor") return jsonResponse({ error: "forbidden" }, 403);
  const ticket = await assertOwnsTicket(env, admin, ticketId);
  if (!ticket) return jsonResponse({ error: "not_found" }, 404);
  await env.DB.prepare(`UPDATE support_tickets SET status = 'resolved', updated_at = ? WHERE id = ?`).bind(now, ticketId).run();
  const updated = { ...ticket, status: "resolved", updated_at: now };
  await notifySupport(env, updated, "Customer closed ticket", `<p>${escapeHtml(admin.email)} closed <strong>${ticketLabel(updated)}</strong>.</p>`);
  try {
    await sendEmail(env, admin.email, `Ticket ${ticketLabel(updated)} closed`, `<p>Your GlucoAlarm ticket <strong>${ticketLabel(updated)}</strong> is now closed.</p>`);
  } catch (err) {
    console.error(`ticket-close customer receipt failed for ${ticketLabel(updated)}:`, err);
  }
  return jsonResponse({ ok: true });
}

export async function postTicketReply(env: Env, admin: Admin, ticketId: string, request: Request, now: number): Promise<Response> {
  const ticket = await assertOwnsTicket(env, admin, ticketId);
  if (!ticket) return jsonResponse({ error: "not_found" }, 404);

  const body = await request.json<{ message?: string }>();
  if (!body.message?.trim()) return jsonResponse({ error: "message is required" }, 400);

  await env.DB
    .prepare(`INSERT INTO support_ticket_messages (ticket_id, admin_id, is_staff, body, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(ticketId, admin.id, admin.is_super_admin ? 1 : 0, body.message.trim(), now)
    .run();

  // A staff reply keeps the ticket open for the customer; a customer reply
  // reopens a ticket staff had marked resolved so it doesn't go unnoticed.
  const newStatus = admin.is_super_admin ? ticket.status : "open";
  await env.DB
    .prepare(`UPDATE support_tickets SET updated_at = ?, status = ? WHERE id = ?`)
    .bind(now, newStatus, ticketId)
    .run();

  await notifySupport(env, ticket, admin.is_super_admin ? "Support replied to ticket" : "Customer replied to ticket", `<p>${escapeHtml(admin.email)} added a reply to <strong>${ticketLabel(ticket)}</strong>.</p><p>${escapeHtml(body.message.trim())}</p>`);

  return jsonResponse({ ok: true }, 201);
}

export async function patchTicketStatus(env: Env, admin: Admin, ticketId: string, request: Request, now: number): Promise<Response> {
  if (!admin.is_super_admin) return jsonResponse({ error: "forbidden" }, 403);
  const ticket = await assertOwnsTicket(env, admin, ticketId);
  if (!ticket) return jsonResponse({ error: "not_found" }, 404);

  const body = await request.json<{ status?: string }>();
  if (!body.status || !["open", "resolved"].includes(body.status)) {
    return jsonResponse({ error: "status must be 'open' or 'resolved'" }, 400);
  }

  await env.DB.prepare(`UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?`).bind(body.status, now, ticketId).run();
  await notifySupport(env, { ...ticket, status: body.status, updated_at: now }, "Ticket status changed", `<p>${escapeHtml(admin.email)} changed <strong>${ticketLabel(ticket)}</strong> to <strong>${body.status}</strong>.</p>`);
  return jsonResponse({ ok: true });
}
