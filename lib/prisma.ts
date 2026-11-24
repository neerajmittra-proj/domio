import { PrismaClient } from '@prisma/client';
import { PrismaNeon, PrismaNeonHttp } from '@prisma/adapter-neon';

// Prisma 7 connects through a driver adapter instead of a schema `url`.
// DATABASE_URL is the Neon (pooled) connection string.
//
// Two runtimes:
// - Node (Vercel / `next dev`): one shared WebSocket-pool client, as before.
// - Cloudflare Workers: a socket may NOT be shared between requests
//   ("Cannot perform I/O on behalf of a different request"), and building a
//   full Prisma client per request costs a lot of memory and CPU. So:
//     · ordinary queries go through ONE shared client per isolate that talks to
//       Neon over plain HTTPS (stateless fetch — safe to share);
//     · interactive transactions (`prisma.$transaction(async (tx) => …)`, used
//       for payments, tenancies, …) get a short-lived WebSocket client for the
//       current request only, because HTTP can't hold a transaction open.
// `prisma` below is a proxy, so the ~100 files that `import { prisma }` keep
// working unchanged on both runtimes.

const isWorkers =
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

function newPoolClient(): PrismaClient {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaHttp?: PrismaClient;
};

// Workers: shared HTTP client for everything except interactive transactions.
function workersHttpClient(): PrismaClient {
  if (!globalForPrisma.prismaHttp) {
    const adapter = new PrismaNeonHttp(process.env.DATABASE_URL as string, {});
    globalForPrisma.prismaHttp = new PrismaClient({ adapter });
  }
  return globalForPrisma.prismaHttp;
}

// Workers: one WebSocket client per request, only created when a transaction runs.
const perRequestTx = new WeakMap<object, PrismaClient>();
function workersTxClient(): PrismaClient {
  // OpenNext keeps the current request's { env, ctx } in AsyncLocalStorage,
  // exposed on this global symbol (what getCloudflareContext() reads).
  const store = (globalThis as Record<symbol, unknown>)[Symbol.for('__cloudflare-context__')] as
    | { ctx?: object }
    | undefined;
  const key = store?.ctx ?? null;
  if (!key) return newPoolClient(); // outside a request: a fresh client still works
  let client = perRequestTx.get(key);
  if (!client) {
    client = newPoolClient();
    perRequestTx.set(key, client);
  }
  return client;
}

function clientFor(prop: PropertyKey): PrismaClient {
  if (isWorkers) {
    return prop === '$transaction' ? workersTxClient() : workersHttpClient();
  }
  if (!globalForPrisma.prisma) globalForPrisma.prisma = newPoolClient();
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = clientFor(prop);
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
