import type {SetupRng} from "./setup-rng.js";

export interface PreparedOrderMarket {
  readonly visibleOrders: readonly string[]
  readonly remainingOrderIds: readonly string[]
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

  return Object.freeze({
    visibleOrders: Object.freeze(shuffle.slice(0,4)),
    remainingOrderIds: Object.freeze(shuffle.slice(4)),
  })
}
