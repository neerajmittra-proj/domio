import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

// Prisma 7 connects through a driver adapter instead of a schema `url`.
// The Neon adapter reads the pooled connection string from DATABASE_URL.
//
// Two runtimes:
// - Node (Vercel / `next dev`): one shared client, reused across requests.
// - Cloudflare Workers: a database connection may NOT be shared between
//   requests ("Cannot perform I/O on behalf of a different request"), so each
//   request gets its own client. `prisma` below is a proxy, so the ~100 files
//   that `import { prisma }` keep working unchanged on both.

function newClient(): PrismaClient {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const isWorkers =
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const perRequest = new WeakMap<object, PrismaClient>();

function currentClient(): PrismaClient {
  if (isWorkers) {
    // OpenNext keeps the current request's { env, ctx } in AsyncLocalStorage,
    // exposed on this global symbol (what getCloudflareContext() reads). Read it
    // directly so this file doesn't import the build tool into the Node bundle.
    const store = (globalThis as Record<symbol, unknown>)[Symbol.for('__cloudflare-context__')] as
      | { ctx?: object }
      | undefined;
    const key = store?.ctx ?? null;
    if (!key) return newClient(); // outside a request: a fresh client still works
    let client = perRequest.get(key);
    if (!client) {
      client = newClient();
      perRequest.set(key, client);
    }
    return client;
  }
  if (!globalForPrisma.prisma) globalForPrisma.prisma = newClient();
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = currentClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
