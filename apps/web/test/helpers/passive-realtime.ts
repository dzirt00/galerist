// Existing HTTP/UI scenarios do not deliver Realtime events. Dedicated tests
// control connection status and delivery explicitly in lobby-realtime.test.ts.
export const passiveRealtime = {
  channel() {
    return {
      on() { return this },
      subscribe() { return this },
    }
  },
  async removeChannel() { return 'ok' },
}
