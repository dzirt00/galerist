import type {SetupRng} from "./setup-rng.js";
import { deepFreeze } from "./component-catalog.js";

export interface PreparedOrderMarket {
  visibleOrders:  Readonly<Record<1 | 2 | 3 | 4,string | null>>
  orderMarket:  Readonly<Record<1 | 2 | 3 | 4, string[]>>
  orderDiscard : readonly string[];
  remainingOrderIds: readonly string[];
}

/** Подготавливает четыре открытых заказа и скрытую колоду по SETUP-003. */
export function prepareOrderMarket(
  orderIds: readonly string[],
  rng: SetupRng,
): PreparedOrderMarket {
   const shuffle = rng.shuffle('orders', orderIds)

  if(shuffle.slice(0,4).length < 4) {
    throw new Error('At least four orders are required')
  }

  return deepFreeze({
    visibleOrders: Object.freeze({
      1: shuffle[0]!,
      2: shuffle[1]!,
      3: shuffle[2]!,
      4: shuffle[3]!
    }),
    remainingOrderIds: Object.freeze(shuffle.slice(4)),
    orderDiscard: [],
    orderMarket: {
      1: [],
      2: [],
      3: [],
      4: []
    }
  })
}
