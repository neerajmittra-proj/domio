import type { NextAuthConfig } from 'next-auth';

// Edge-safe shared config, imported by auth.ts (Node runtime, where the
// Credentials provider adds Prisma + bcrypt). There is currently no proxy.ts:
// route protection is enforced server-side by app/dashboard/layout.tsx and by
// each API route. Keep this file free of Prisma/bcrypt/Node-only imports so it
// stays usable from an Edge proxy if one is added later.
export const authConfig = {
  // Credentials sessions can't use a DB-session adapter — store them as JWTs.
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  // Providers are added in auth.ts; the Edge proxy doesn't need them to read cookies.
  providers: [],
  callbacks: {
    // Copy the user's role into the token at sign-in, then expose it on the
    // session so server code can read `session.user.role` (OWNER / SUPER_ADMIN).
    jwt({ token, user }) {
      if (user) token.role = user.role;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      if (token.role) session.user.role = token.role;
      return session;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
