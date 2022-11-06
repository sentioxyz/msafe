import * as main  from './types/aptos/msafe'
import * as test  from './types/aptos/testnet/msafe'

import { aptos, EventTracker } from "@sentio/sdk";
import { code } from "@sentio/sdk/lib/builtin/aptos/0x1";
import { isMSafeAddress } from "./util";

const wallet_tracker = EventTracker.register("wallets_registered")
const register_finished_tracker = EventTracker.register("safe_registered")
const safe_failed_tacker = EventTracker.register("safe_failed")
const deployer_tracker = EventTracker.register("deployer")

for (const env of [main, test]) {
  const startVersion = env === main ? 0 : 234030000

  // 1. Wallets registered
  // https://explorer.aptoslabs.com/txn/25061073/payload
  env.registry.bind({startVersion})
    .onEntryRegister((call, ctx) => {
      wallet_tracker.trackEvent(ctx, {distinctId: ctx.transaction.sender})
      ctx.meter.Counter("num_entry_register").add(1)
    })

  // 2. Momentum Safe addresses finished registration
  // https://explorer.aptoslabs.com/txn/25108956/events
  env.momentum_safe.bind({startVersion})
      .onEventInfo(async (event, ctx) => {
        const address = ctx.transaction.sender
        if (await isMSafeAddress(ctx, address)) {
          register_finished_tracker.trackEvent(ctx, {distinctId: address})
          ctx.meter.Counter("num_event_info").add(1)
        } else {
          ctx.meter.Counter("num_event_info_not_msafe").add(1)
        }
      })

  // 3. Momentum Safe failed registration
  // https://explorer.aptoslabs.com/txn/0x3df4a5048d0348593b36046420b9fef3dcf26092d62e7029458b32ad35868469/events
  env.creator.bind({startVersion})
    .onEntryInitWalletCreation(async (call, ctx) => {
      const events = aptos.TYPE_REGISTRY.filterAndDecodeEvents<
          main.registry.OwnerMomentumSafesChangeEvent | test.registry.OwnerMomentumSafesChangeEvent>(
          env.registry.OwnerMomentumSafesChangeEvent.TYPE_QNAME,  ctx.transaction.events)
      ctx.meter.Counter("num_entry_init_wallet_creation").add(1)

      if (events.length === 0) {
        console.warn("OwnerMomentumSafesChangeEvent not found for wallet init", ctx.version)
      }
      const address = events[0].data_typed.msafe
      if (!(await isMSafeAddress(ctx, address))) {
        // TODO do we need check those who doesn't have onEventInfo
        safe_failed_tacker.trackEvent(ctx, {distinctId: address})
      }
    })

  // 4. Number of deployer
  // https://explorer.aptoslabs.com/txn/25261124
  code.bind({ network: env.registry.DEFAULT_OPTIONS.network, startVersion })
    .onEntryPublishPackageTxn(async (call, ctx) => {
      const address = ctx.transaction.sender
      if (await isMSafeAddress(ctx, address)) {
        deployer_tracker.trackEvent(ctx, {distinctId: address})
        ctx.meter.Counter("num_deploys").add(1)
        ctx.logger.info(`deploy use msafe: version: ${ctx.version} , sender: ${ctx.transaction.sender} `)
      }
    })
}
