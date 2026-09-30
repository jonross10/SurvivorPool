export const KLAVIYO_BASE = "https://a.klaviyo.com/api";

// Beta revision for the Customer Agent endpoints; the stable revision for everything else
// (events, profiles, custom objects, data-source records).
export const KLAVIYO_REVISION = "2026-07-15";
export const KLAVIYO_REVISION_BETA = "2026-07-15.pre";

/** Standard JSON:API headers for a Klaviyo private-key request. */
export function klaviyoHeaders(revision: string = KLAVIYO_REVISION): Record<string, string> {
  const key = process.env.KLAVIYO_API_KEY;
  if (!key) throw new Error("KLAVIYO_API_KEY is not set");
  return {
    Authorization: `Klaviyo-API-Key ${key}`,
    revision,
    accept: "application/vnd.api+json",
    "content-type": "application/vnd.api+json",
  };
}
