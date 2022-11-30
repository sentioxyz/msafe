import * as main  from './types/aptos/msafe'
import * as test  from './types/aptos/testnet/msafe'

import { aptos, EventTracker } from "@sentio/sdk";
import { code } from "@sentio/sdk/lib/builtin/aptos/0x1";
import { isMSafeAddress } from "./util";

const trackerOption = { unique: true, totalByDay: false }
// const wallet_tracker = EventTracker.register("wallets_registered", trackerOption)
const register_finished_tracker = EventTracker.register("safe_registered", trackerOption)
const deployer_tracker = EventTracker.register("deployer", trackerOption)

for (const env of [main, test]) {
  const startVersion = env === main ? 0 : 234030000

  // 1. Wallets registered
  // https://explorer.aptoslabs.com/txn/25061073/payload
  env.registry.bind({startVersion})
    .onEntryRegister((call, ctx) => {
      // wallet_tracker.trackEvent(ctx, {distinctId: ctx.transaction.sender})
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
      .onEventTransaction((evt, ctx) => {
        ctx.meter.Counter("num_event_transaction").add(1)
      })

  // 3. Momentum Safe failed registration
  // https://explorer.aptoslabs.com/txn/0x3df4a5048d0348593b36046420b9fef3dcf26092d62e7029458b32ad35868469/events
  env.creator.bind({startVersion})
    .onEntryInitWalletCreation(async (call, ctx) => {
      const events = aptos.TYPE_REGISTRY.filterAndDecodeEvents<
          main.registry.OwnerMomentumSafesChangeEvent | test.registry.OwnerMomentumSafesChangeEvent>(
          env.registry.OwnerMomentumSafesChangeEvent.TYPE_QNAME,  ctx.transaction.events)
      if (events.length === 0) {
        console.error("OwnerMomentumSafesChangeEvent not found for wallet init", ctx.version)
      }
      ctx.meter.Counter("wallet_created").add(1)
    })

  // aptos.AptosAccountProcessor.bind({ address: env.registry.DEFAULT_OPTIONS.address, network: env.registry.DEFAULT_OPTIONS.network, startVersion })
  //   .onVersionInterval(async (res, ctx) => {
  //     const resType = env.creator.PendingMultiSigCreations.TYPE_QNAME
  //   })

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
