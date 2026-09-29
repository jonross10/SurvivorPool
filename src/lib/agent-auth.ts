import { errorDocument, jsonApi } from "./jsonapi";
import { getSessionUserId } from "./session";
import type { NextResponse } from "next/server";

/**
 * Gate for mutation routes. Returns a 401 response to return early, or null to proceed.
 * When AGENT_WRITE_TOKEN is unset (default), all writes are allowed — the browser UI
 * and the agent both post freely to the public site. When it is set, writes require
 * `Authorization: Bearer <AGENT_WRITE_TOKEN>` (the automation/agent path, and the way
 * to bypass any future site gate). Setting it therefore locks down ALL writes.
 */
export function requireAgentWrite(req: Request): NextResponse | null {
  const token = process.env.AGENT_WRITE_TOKEN;
  if (!token) return null;
  const header = req.headers.get("authorization") ?? "";
  if (header === `Bearer ${token}`) return null;
  return jsonApi(errorDocument([{ status: "401", title: "Unauthorized", detail: "Valid write token required" }]), 401);
}

/**
 * The user id this request acts as: the logged-in user, or — for the trusted
 * automation path — the `X-On-Behalf-Of` user when a valid AGENT_WRITE_TOKEN is
 * presented. The on-behalf-of id is honored ONLY alongside a valid token, so it
 * cannot be spoofed. Returns null when neither authenticates.
 */
export async function resolveActorUserId(req: Request): Promise<string | null> {
  const sessionUser = await getSessionUserId(req);
  if (sessionUser) return sessionUser;

  const token = process.env.AGENT_WRITE_TOKEN;
  if (token) {
    const header = req.headers.get("authorization") ?? "";
    if (header === `Bearer ${token}`) {
      return req.headers.get("x-on-behalf-of");
    }
  }
  return null;
}
