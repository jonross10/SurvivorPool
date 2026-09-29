import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

// baseURL defaults to the current origin in the browser, so this works across
// localhost, Vercel previews, and production without per-environment config.
export const authClient = createAuthClient({ plugins: [magicLinkClient()] });

export const { signIn, signOut, useSession } = authClient;
