import { errorDocument, jsonApi } from "./jsonapi";

/** Gate a cron route: returns a 401 response to return early, or null to proceed. */
export function requireCron(req: Request): ReturnType<typeof jsonApi> | null {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return jsonApi(errorDocument([{ status: "401", title: "Unauthorized" }]), 401);
  }
  return null;
}
