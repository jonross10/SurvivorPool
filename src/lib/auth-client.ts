import { createAuthClient } from "better-auth/react";

// baseURL defaults to the current origin in the browser, so this works across
// localhost, Vercel previews, and production without per-environment config.
export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;
