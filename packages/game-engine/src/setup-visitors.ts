import type { VisitorInstance } from './component-catalog.js'
import type { SetupRng } from "./setup-rng.js";

export interface PreparedVisitorBag {
  readonly visitors: readonly VisitorInstance[]
}

export function prepareVisitorBag(
  visitors: readonly VisitorInstance[],
  rng: SetupRng,
): PreparedVisitorBag {
  const sortedVisitors = [...visitors].sort((a, b) => {
    if (a.id > b.id) return 1;
    if (a.id < b.id) return -1;
    return 0;
  });
  const shuffled = rng.shuffle('visitors', sortedVisitors);
  const shuffleVisitors = Object.freeze(shuffled.map(visitor => (Object.freeze({ ...visitor }))));

  return Object.freeze({ visitors: shuffleVisitors });
}
