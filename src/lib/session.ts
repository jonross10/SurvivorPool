import { auth } from "./auth";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

/** Current authenticated user id from the request cookies, or null. */
export async function getSessionUserId(req: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  return session?.user?.id ?? null;
}

/** Current authenticated user (id, email, name) from the request cookies, or null. */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  const u = session?.user;
  if (!u?.id) return null;
  return { id: u.id, email: u.email ?? "", name: u.name ?? "" };
}
