import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { resolveDatabaseUrl } from "./db/client";
import { sendMagicLinkEmail, linkProfileExternalId } from "./klaviyo";

// Neon's Pool talks to Postgres over WebSockets. Vercel's Node serverless runtime has
// no global WebSocket, so supply one. Also route plain (non-transaction) queries over
// HTTP fetch — faster, and it keeps the common read path off WebSockets entirely.
neonConfig.webSocketConstructor = ws;
neonConfig.poolQueryViaFetch = true;

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
  databaseHooks: {
    user: {
      create: {
        // On account creation (Google or magic-link), create/link the Klaviyo profile
        // with external_id = our user id so flows can target {{ person.external_id }}
        // immediately. Best-effort — never block sign-up if Klaviyo is unavailable.
        after: async (user) => {
          try {
            if (user.email) await linkProfileExternalId(user.email, user.id);
          } catch {
            /* non-fatal */
          }
        },
      },
    },
  },
  plugins: [
    // Passwordless email sign-in. The link is delivered by a Klaviyo flow triggered by
    // the "Magic Link Requested" event we track in sendMagicLinkEmail. Auto-creates users.
    magicLink({
      expiresIn: 900, // 15 minutes
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail(email, url);
      },
    }),
    // Must be the last plugin: lets Better Auth set cookies from Next.js server contexts.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
