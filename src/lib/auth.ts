import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "@neondatabase/serverless";
import { resolveDatabaseUrl } from "./db/client";

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
