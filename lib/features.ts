// Release flags. Per the product plan: Part 1 = owner side (MVP v1), Part 2 =
// tenant view and marketplace. Set NEXT_PUBLIC_ENABLE_PART2=true in Vercel and
// redeploy to switch on the tenant portal, online payments, public listings and
// the agent marketplace. Off by default.
export const PART2_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PART2 === 'true';

/** For API routes: a 404 response while Part 2 is off, otherwise null. */
export function part2Guard(): Response | null {
  return PART2_ENABLED ? null : Response.json({ error: 'Not found' }, { status: 404 });
}
