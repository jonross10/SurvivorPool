import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { resolveDatabaseUrl } from "./db/client";

// Neon's Pool talks to Postgres over WebSockets. Vercel's Node serverless runtime has
// no global WebSocket, so supply one — otherwise every Better Auth query throws at
// runtime (500). Local Node 22+ has a global WebSocket, which is why dev worked.
neonConfig.webSocketConstructor = ws;

// Better Auth accepts a node-postgres-compatible Pool; Neon's serverless Pool works,
// so we reuse the app's single DB driver and connection helper.
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: new Pool({ connectionString: resolveDatabaseUrl() }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
    // Apple added later (Phase 4) — same socialProviders shape.
  },
  // Must be the last plugin: lets Better Auth set cookies from Next.js server contexts.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
