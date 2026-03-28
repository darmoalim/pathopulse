/**
 * PathoPulse Real-Time Event Bus
 * Simple in-memory pub/sub for Server-Sent Events.
 * Uses a global Set of WritableStreamDefaultWriter instances.
 */

export interface FeedEvent {
  message: string;
  severity?: string | null;
  disease?: string | null;
  zone_name?: string | null;
  timestamp: string;
}

// Global set of active SSE controllers — persists across Next.js hot reloads in dev
declare global {
  // eslint-disable-next-line no-var
  var __sse_clients: Set<ReadableStreamDefaultController> | undefined;
}

function getClients(): Set<ReadableStreamDefaultController> {
  if (!global.__sse_clients) global.__sse_clients = new Set();
  return global.__sse_clients;
}

export function broadcastEvent(event: FeedEvent) {
  const clients = getClients();
  const data = `data: ${JSON.stringify(event)}\n\n`;
  const enc = new TextEncoder();
  for (const ctrl of clients) {
    try { ctrl.enqueue(enc.encode(data)); } catch { clients.delete(ctrl); }
  }
}

export function addClient(ctrl: ReadableStreamDefaultController) {
  getClients().add(ctrl);
}

export function removeClient(ctrl: ReadableStreamDefaultController) {
  getClients().delete(ctrl);
}
