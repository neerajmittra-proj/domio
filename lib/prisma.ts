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
//     · reads go through ONE shared client per isolate that talks to Neon over
//       plain HTTPS (stateless fetch — safe to share);
//     · writes, raw executes and transactions (`prisma.$transaction(…)`, used
//       for payments, tenancies, …) get a short-lived WebSocket client for the
//       current request only, because the HTTP driver can't do transactions.
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
  const key = currentRequestKey();
  if (!key) return newPoolClient(); // outside a request: a fresh client still works
  let client = perRequestTx.get(key);
  if (!client) {
    client = newPoolClient();
    perRequestTx.set(key, client);
  }
  return client;
}

// Model methods that write. On Workers these go through the per-request
// WebSocket client, because Prisma may wrap a write in an implicit transaction
// and the HTTP driver can't do transactions ("Transactions are not supported in
// HTTP mode"). Reads stay on the fast shared HTTP client.
const WRITE_METHODS = new Set<PropertyKey>([
  'create', 'createMany', 'createManyAndReturn',
  'update', 'updateMany', 'updateManyAndReturn',
  'upsert', 'delete', 'deleteMany',
]);
// Top-level client methods that need the WebSocket client on Workers.
const WS_CLIENT_METHODS = new Set<PropertyKey>([
  '$transaction', '$executeRaw', '$executeRawUnsafe',
]);

// Each HTTP query is a separate outgoing request ("subrequest"), and Cloudflare's
// free plan allows only 50 per incoming request. Heavy pages (the dashboard runs
// many queries at once) would hit that, so after HTTP_QUERY_BUDGET HTTP reads in
// one request the rest go over the WebSocket client, which uses one connection.
const HTTP_QUERY_BUDGET = 20;
const httpQueriesPerRequest = new WeakMap<object, number>();
function currentRequestKey(): object | null {
  const store = (globalThis as Record<symbol, unknown>)[Symbol.for('__cloudflare-context__')] as
    | { ctx?: object }
    | undefined;
  return store?.ctx ?? null;
}
/** Count one HTTP read for this request; false once the budget is used up. */
function takeHttpBudget(): boolean {
  const key = currentRequestKey();
  if (!key) return true;
  const used = httpQueriesPerRequest.get(key) ?? 0;
  if (used >= HTTP_QUERY_BUDGET) return false;
  httpQueriesPerRequest.set(key, used + 1);
  return true;
}

function bound<T>(target: T, prop: PropertyKey) {
  const value = Reflect.get(target as object, prop, target);
  return typeof value === 'function' ? value.bind(target) : value;
}

function nodeClient(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = newPoolClient();
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!isWorkers) return bound(nodeClient(), prop);
    if (WS_CLIENT_METHODS.has(prop)) return bound(workersTxClient(), prop);
    const http = workersHttpClient();
    const value = Reflect.get(http, prop, http);
    if (typeof prop === 'string' && !prop.startsWith('$') && value && typeof value === 'object') {
      // A model delegate (prisma.rentLedger, prisma.tenant, …): reads → HTTP,
      // writes → this request's WebSocket client.
      return new Proxy(value as object, {
        get(delegate, method) {
          const isQuery = typeof method === 'string' && typeof Reflect.get(delegate, method) === 'function';
          if (WRITE_METHODS.has(method) || (isQuery && !takeHttpBudget())) {
            const ws = workersTxClient() as unknown as Record<string, object>;
            return bound(ws[prop], method);
          }
          return bound(delegate, method);
        },
      });
    }
    if (typeof value === 'function' && (prop === '$queryRaw' || prop === '$queryRawUnsafe') && !takeHttpBudget()) {
      return bound(workersTxClient(), prop);
    }
    return typeof value === 'function' ? value.bind(http) : value;
  },
});
