import type { PlayerState } from "./types.js";
import type { OpenArtworkSlot } from "./setup-artworks.js";
import { spendInfluenceForImmediatePayment } from "./influence-spending-award.js";
import { deepFreeze, type VisitorInstance } from "./component-catalog.js";


export type ArtworkPurchaseType = 'regular' | 'contract'

export interface ApplyArtworkPurchaseInput {
  readonly player: Readonly<PlayerState>
  readonly openArtwork: Readonly<OpenArtworkSlot>
  readonly artistInitialFame: number
  readonly artistCurrentFame: number
  readonly purchaseType: ArtworkPurchaseType
  readonly plazaVisitors: readonly VisitorInstance[]
  readonly targetInfluence?: number
}

export interface ArtworkPurchasePaymentResult {
  readonly player: Readonly<PlayerState>
  readonly openArtwork: Readonly<OpenArtworkSlot>
  readonly plazaVisitors: readonly VisitorInstance[]
}

/**
 * Применяет оплату и перенос посетителей для уже разрешённой покупки по ARTWORK-003.
 *
 * Контрактная покупка оплачивается по начальной известности художника, обычная —
 * по текущей. При нехватке монет вызывающая сторона должна передать допустимую
 * целевую отметку влияния для немедленной конвертации по INFLUENCE-002.
 * Посетители переходят с работы на площадь только после успешной полной оплаты.
 *
 * Функция не проверяет доступность покупки по ARTWORK-001 и не применяет награды
 * ARTWORK-004. Входы не изменяются и не замораживаются; результат состоит из
 * независимых копий и глубоко заморожен.
 */
export function applyArtworkPurchaseCostAndMoveVisitors(
  input: ApplyArtworkPurchaseInput
): ArtworkPurchasePaymentResult {

  let copyPlayer = { ...input.player }
  const cost = ( input.purchaseType === 'contract' ) ? input.artistInitialFame : input.artistCurrentFame

  // Оплата завершается до подготовки перемещения: любой отказ оставляет работу
  // и площадь без изменений и не возвращает частично применённый результат.
  if ( copyPlayer.coins >= cost ) {
    copyPlayer = {
      ...input.player,
      coins: input.player.coins - cost
    }
  } else {
    if ( input.targetInfluence === undefined ) {
      throw new RangeError( 'Insufficient funds' )
    }

    copyPlayer = spendInfluenceForImmediatePayment(
      copyPlayer,
      cost,
      input.targetInfluence,
    )
  }

  // Каждый вложенный объект копируется до deepFreeze, иначе заморозка результата
  // могла бы затронуть переданные вызывающей стороной работу и посетителей.
  let artworkVisitors = [ ...input.openArtwork.visitors.map( item => ( { ...item } ) ) ]
  let plazaVisitorsCopy = [ ...input.plazaVisitors ].map( item => ( { ...item } ) )

  // Новые посетители добавляются после уже находящихся на площади, сохраняя
  // исходный порядок посетителей на купленной работе.
  plazaVisitorsCopy.push( ...artworkVisitors )

  return deepFreeze( {
    player: copyPlayer,
    plazaVisitors: plazaVisitorsCopy,
    openArtwork: {
      artwork: { ...input.openArtwork.artwork },
      visitors: []
    }
  } )
}
