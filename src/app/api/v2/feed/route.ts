import { db } from "@/db";
import { event_log } from "@/db/schema";
import { desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v2/feed
 * Server-Sent Events endpoint for real-time live ticker.
 * On connect: stream the 20 most recent events.
 * On new report submissions: automatically broadcast via broadcastEvent().
 */
export async function GET() {
  // Fetch recent history from DB
  let recentEvents: typeof event_log.$inferSelect[] = [];
  try {
    recentEvents = await db.select().from(event_log)
      .orderBy(desc(event_log.created_at))
      .limit(20)
      .all();
  } catch { /* DB might not have table yet */ }

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();

      // Send recent history immediately on connect
      let lastId = 0;
      for (const ev of recentEvents.reverse()) {
        if (ev.id > lastId) lastId = ev.id;
        const payload = {
          message: ev.message,
          severity: ev.severity,
          disease: ev.disease,
          zone_name: ev.zone_name,
          timestamp: ev.created_at,
        };
        controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
      }

      // Robust long-polling SQLite hook for Next.js isolated workers
      // We check the DB every 2 seconds for net-new event_log entries
      const pollDb = setInterval(async () => {
        try {
          const newEvents = await db.select().from(event_log)
            .where(sql`id > ${lastId}`)
            .orderBy(event_log.id)
            .all();

          for (const ev of newEvents) {
            lastId = ev.id;
            const payload = {
              message: ev.message,
              severity: ev.severity,
              disease: ev.disease,
              zone_name: ev.zone_name,
              timestamp: ev.created_at,
            };
            controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
          }
        } catch { /* ignore poll errors to keep stream alive */ }
      }, 2000);

      // Keepalive ping every 20s to prevent reverse proxy timeouts (Vercel/Nginx)
      const ping = setInterval(() => {
        try { controller.enqueue(enc.encode(": ping\n\n")); } catch { /* stream closed */ }
      }, 20000);

      // Cleanup on disconnect
      (controller as any)._cleanup = () => {
        clearInterval(pollDb);
        clearInterval(ping);
      };
    },
    cancel(controller) {
      if ((controller as any)._cleanup) {
        (controller as any)._cleanup();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
