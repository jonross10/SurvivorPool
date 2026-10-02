import { getSessionUser } from "@/lib/session";
import { getPrefs, setPrefs } from "@/lib/db/notification-prefs-repo";
import { metaDocument, jsonApi, unauthorized } from "@/lib/jsonapi";

/** The signed-in user's "notify me about" preferences. */
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const p = await getPrefs(user.id);
  return jsonApi(metaDocument({ notifyFinal: p.notifyFinal, notifyLive: p.notifyLive }));
}

/** Update the signed-in user's preferences. Accepts partial { notifyFinal?, notifyLive? }. */
export async function PATCH(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const attrs = body?.data?.attributes ?? body ?? {};
  const current = await getPrefs(user.id);
  const next = {
    notifyFinal: typeof attrs.notifyFinal === "boolean" ? attrs.notifyFinal : current.notifyFinal,
    notifyLive: typeof attrs.notifyLive === "boolean" ? attrs.notifyLive : current.notifyLive,
  };
  await setPrefs(user.id, next);
  return jsonApi(metaDocument(next));
}
