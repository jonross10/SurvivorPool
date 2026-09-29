// TEMPORARY diagnostic route — remove after debugging prod auth 500s.
import { auth } from "@/lib/auth";

export async function GET(req: Request) {
  const env = {
    BETTER_AUTH_SECRET: !!process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? null,
    GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    NEON_DB_CONNECTION_URL: !!process.env.NEON_DB_CONNECTION_URL,
    API_KEY: !!process.env.API_KEY,
  };
  let sessionOk = false;
  let error: { name?: string; message?: string; stack?: string } | null = null;
  try {
    await auth.api.getSession({ headers: req.headers });
    sessionOk = true;
  } catch (e) {
    const err = e as Error;
    error = { name: err?.name, message: err?.message, stack: (err?.stack ?? "").split("\n").slice(0, 4).join(" | ") };
  }
  return Response.json({ env, sessionOk, error });
}
