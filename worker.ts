// Cloudflare Worker entry for Domio.
// - fetch: the Next.js app, built by `opennextjs-cloudflare build`
// - scheduled: Cloudflare Cron Trigger (wrangler.jsonc → triggers.crons) that
//   runs the daily rent-reminder job by calling our own cron route, so it gets
//   the same request context, auth check and logging as on Vercel.

// @ts-ignore `.open-next/worker.js` is generated at build time
import { default as handler } from './.open-next/worker.js';

type Env = { CRON_SECRET?: string; [key: string]: unknown };
type Ctx = { waitUntil(p: Promise<unknown>): void; passThroughOnException(): void };

export default {
  fetch: handler.fetch,

  async scheduled(_event: unknown, env: Env, ctx: Ctx) {
    const secret = env.CRON_SECRET;
    if (!secret) {
      console.error('[cron] CRON_SECRET is not set; skipping rent reminders');
      return;
    }
    const req = new Request('https://domio.internal/api/cron/rent-reminders', {
      headers: { authorization: `Bearer ${secret}` },
    });
    const res: Response = await handler.fetch(req, env, ctx);
    console.log('[cron] rent-reminders', res.status, await res.text());
  },
};

