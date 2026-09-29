import { monotonicFactory } from "ulid";

const ulid = monotonicFactory();

/** New ULID — time-sortable, index-friendly primary key. */
export function newId(): string {
  return ulid();
}
