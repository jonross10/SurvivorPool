export interface Resource<A> { type: string; id: string; attributes: A }

export function unwrapMany<A>(doc: { data?: Resource<A>[] }): A[] {
  return (doc.data ?? []).map((r) => r.attributes);
}

export function unwrapOne<A>(doc: { data: Resource<A> }): A {
  return doc.data.attributes;
}
