import type { Env } from "./types";
import type { Admin } from "./auth";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

interface TicketRow {
  id: number;
  customer_id: string;
  admin_id: string;
  subject: string;
  status: string;
  created_at: number;
  updated_at: number;
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

  const result = await env.DB
    .prepare(`INSERT INTO support_tickets (customer_id, admin_id, subject, status, created_at, updated_at) VALUES (?, ?, ?, 'open', ?, ?)`)
    .bind(admin.customer_id, admin.id, body.subject.trim(), now, now)
    .run();
  const ticketId = result.meta.last_row_id;

  await env.DB
    .prepare(`INSERT INTO support_ticket_messages (ticket_id, admin_id, is_staff, body, created_at) VALUES (?, ?, 0, ?, ?)`)
    .bind(ticketId, admin.id, body.message.trim(), now)
    .run();

  return jsonResponse({ id: ticketId }, 201);
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
  return jsonResponse({ ok: true });
}
