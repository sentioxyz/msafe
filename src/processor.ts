import { creator, momentum_safe, registry } from './types/aptos/msafe'
import { EventTracker } from "@sentio/sdk";

// registry.bind().onev''

const wallet_tracker = EventTracker.register("wallets_registered")
const register_finished_tracker = EventTracker.register("safe_registered")
const safe_failed_tacker = EventTracker.register("safe_failed")

// 1. Wallets registered
// https://explorer.aptoslabs.com/txn/25061073/payload
registry.bind()
  .onEntryRegister((call, ctx) => {
    wallet_tracker.trackEvent(ctx, { distinctId: ctx.transaction.sender})
  })

// 2. Momentum Safe addresses finished registration
// https://explorer.aptoslabs.com/txn/25108956/events
momentum_safe.bind()
  .onEventInfo((event, ctx) => {
    register_finished_tracker.trackEvent(ctx, { distinctId: ctx.transaction.sender })
  })

// 3. Momentum Safe failed registration
creator.bind()
  .onEventMomentumSafeCreation((event,ctx) => {

  })
