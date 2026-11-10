export interface GameListItem {
  id: string
  seat_count: number
  occupiedSeatCount: number
  hasPassword: boolean
  turnDurationMinutes: number
  display_name: string
}

export interface CardRoom {
  game: GameListItem
  label: string,
  passwordInputId: string,
  freeSeatCount: number,
  passwordLabel: string,
  joinLabel: string,
  isJoinDisabled: boolean
  isFull: boolean,
}
