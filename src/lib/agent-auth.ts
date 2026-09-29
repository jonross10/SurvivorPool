import { getSessionUserId } from "./session";
import { getUserIdByEmail } from "./db/users-repo";

/**
 * The user id a request acts as, or null if the request isn't authenticated.
 *
 * - Human users are resolved from their Better Auth **session cookie**. A valid
 *   session always wins, and any `userId`/`email` param is ignored — a signed-in
 *   user can never act as someone else.
 * - The **automation path** (the Klaviyo agent, which has no browser session)
 *   authenticates with the shared `API_KEY` via the `X-API-Key` header and names the
 *   user it acts for via a query param: `userId` (our id) or `email` (mapped to our
 *   id — this is what the agent's custom tools inject from the Klaviyo profile).
 *   Honored ONLY when the API key is valid, so it cannot be spoofed.
 */
export async function resolveActorUserId(req: Request): Promise<string | null> {
  const sessionUser = await getSessionUserId(req);
  if (sessionUser) return sessionUser;

  const apiKey = process.env.API_KEY;
  if (apiKey && req.headers.get("x-api-key") === apiKey) {
    const params = new URL(req.url).searchParams;
    const userId = params.get("userId");
    if (userId) return userId;
    const email = params.get("email");
    if (email) return await getUserIdByEmail(email);
  }
  return null;
}
