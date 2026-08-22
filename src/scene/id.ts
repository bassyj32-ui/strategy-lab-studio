// Collision-safe unique id generator.
// Combines a type prefix, a timestamp, a monotonic counter, and random bytes
// so that ids are unique even across rapid successive calls within the same ms.
let counter = 0;

export function createId(prefix: string): string {
  counter += 1;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${counter.toString(36)}-${rand}`;
}
