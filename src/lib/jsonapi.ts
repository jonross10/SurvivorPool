import { NextResponse } from "next/server";

export interface ResourceObject<A = Record<string, unknown>> {
  type: string;
  id: string;
  attributes: A;
}
export interface JsonApiError {
  status: string;
  title: string;
  detail?: string;
}

export function resource<A>(type: string, id: string, attributes: A): ResourceObject<A> {
  return { type, id, attributes };
}

export function document<A>(
  data: ResourceObject<A> | ResourceObject<A>[],
  meta?: Record<string, unknown>,
): { data: ResourceObject<A> | ResourceObject<A>[]; meta?: Record<string, unknown> } {
  return meta === undefined ? { data } : { data, meta };
}

export function metaDocument(meta: Record<string, unknown>): { meta: Record<string, unknown> } {
  return { meta };
}

export function errorDocument(errors: JsonApiError[]): { errors: JsonApiError[] } {
  return { errors };
}

const CONTENT_TYPE = "application/vnd.api+json";

export function jsonApi(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "content-type": CONTENT_TYPE } });
}

/** Reads a JSON:API filter param, e.g. getFilter(req, "week") → ?filter[week]=... */
export function getFilter(req: Request, key: string): string | null {
  return new URL(req.url).searchParams.get(`filter[${key}]`);
}
