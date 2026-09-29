import { auth } from "./auth";

/** Current authenticated user id from the request cookies, or null. */
export async function getSessionUserId(req: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  return session?.user?.id ?? null;
}
