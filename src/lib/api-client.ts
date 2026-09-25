/** Client-side wrappers for the JSON:API mutation endpoints. */
import type { EntrySettings } from "./types";

const HEADERS = { "content-type": "application/vnd.api+json" };

function send(url: string, method: string, attributes: Record<string, unknown>, type?: string): Promise<Response> {
  const data = type ? { type, attributes } : { attributes };
  return fetch(url, { method, headers: HEADERS, body: JSON.stringify({ data }) });
}

export function recordPick(entry: string, week: number, team: string, winProb: number): Promise<Response> {
  return send("/api/pick", "POST", { entry, week, team, winProb }, "pick");
}

export function removePick(entry: string, week: number): Promise<Response> {
  return send("/api/pick", "DELETE", { entry, week }, "pick");
}

export function setPickOverride(
  entry: string, week: number, outcome: "survived" | "out" | "revived",
): Promise<Response> {
  return send("/api/pick-override", "POST", { entry, week, outcome }, "pick-override");
}

export function clearPickOverride(entry: string, week: number): Promise<Response> {
  return send("/api/pick-override", "DELETE", { entry, week });
}

export function updateEntrySettings(id: string, settings: EntrySettings): Promise<Response> {
  return send(`/api/entries/${id}`, "PATCH", { settings });
}

export function createEntry(name: string): Promise<Response> {
  return send("/api/entries", "POST", { name }, "entry");
}

export function deleteEntry(id: string): Promise<Response> {
  return fetch(`/api/entries/${id}`, { method: "DELETE" });
}

/** Detail message from a JSON:API error response, with a fallback. */
export async function errorDetail(res: Response, fallback: string): Promise<string> {
  const doc = await res.json().catch(() => ({}));
  return doc?.errors?.[0]?.detail ?? fallback;
}

/** Names of entries that are still alive (used to populate entry pickers). */
export async function fetchAliveEntryNames(): Promise<string[]> {
  const doc = await (await fetch("/api/entries")).json();
  return (doc.data ?? [])
    .filter((e: { attributes: { eliminated?: boolean } }) => !e.attributes.eliminated)
    .map((e: { attributes: { name: string } }) => e.attributes.name);
}
