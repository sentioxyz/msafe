import * as main  from './types/aptos/msafe.js'
import * as test  from './types/aptos/testnet/msafe.js'

import { Counter } from "@sentio/sdk";
import { code } from "@sentio/sdk/aptos/builtin/0x1";
import { isMSafeAddress, mainnetClient, testnetClient } from "./util.js";
import { momentum_safe } from "./types/aptos/msafe.js";
import {AptosAccount, BCS, HexString, TxnBuilderTypes } from "aptos-sdk";

// @ts-ignore
import { MSafeTransaction } from "@sentio/msafe/lib/momentum-safe/msafe-txn";
// import { App } from "@manahippo/coin-list/dist/lib/coin_list/coin_list";
// import { DEFAULT_MAINNET_LIST, DEFAULT_TESTNET_LIST,RawCoinInfo } from "@manahippo/coin-list";

import { BigDecimal } from "@sentio/sdk";
// import { getPriceByType } from "@sentio/sdk/lib/utils/price";
import { defaultMoveCoder } from "@sentio/sdk/aptos";
import { getPrice, whitelistCoins } from "@sentio/sdk/aptos/ext";

// const trackerOption = { unique: true, totalByDay: false }
// const wallet_tracker = EventTracker.register("wallets_registered", trackerOption)
// const register_finished_tracker = EventTracker.register("safe_registered", trackerOption)
// const deployer_tracker = EventTracker.register("deployer", trackerOption)

const movement = Counter.register("apt_coin_move", { sparse: true })
// const txbreakdwon = Counter.register("tx_breakdown", { sparse: true })

const chains = [
    main,
  // test
]

for (const env of chains) {
  const startVersion = env === main ? 0 : 234030000

  const tokenMap =  whitelistCoins()

  // const tokenMap = new Map<string, SimpleCoinInfo>()
  // for (const info of list) {
  //   tokenMap.set(info.token_type.type, info)
  // }

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
          ctx.eventLogger.emit("Register Finished", {
            distinctId: address,
            account: address
          })
          ctx.meter.Counter("num_event_info").add(1)
        } else {
          ctx.meter.Counter("num_event_info_not_msafe").add(1)
        }
      })
      .onEventTransaction(async (evt: momentum_safe.TransactionInstance, ctx) => {
        if (evt.data_decoded.signatures.data.length === 1) {
          ctx.meter.Counter("num_event_transaction").add(1)
        }

        const hexString = evt.data_decoded.payload.slice(2) //.split("").reverse().join("")
        const hex = Uint8Array.from(Buffer.from(hexString, 'hex')).slice(32);
        const deserializer = new BCS.Deserializer(hex)

        const tx = TxnBuilderTypes.RawTransaction.deserialize(deserializer)
        // @ts-ignore
        if (!tx?.payload) {
          console.log("no payload: ", ctx.transaction.version)
          return
        }

        // @ts-ignore
        const entry = tx.payload.value as TxnBuilderTypes.EntryFunction
        // txbreakdwon.add(ctx, 1, {account: evt.guid.account_address, func: entry.function_name.value})

        if (!entry.function_name) {
          console.log("no function anme: ", ctx.transaction.version)
          return
        }

        if (entry.function_name.value !== "transfer") {
          ctx.eventLogger.emit("Transaction", {
            distinctId: evt.guid.account_address,
            function: entry.function_name.value,
          })
          return
        }
        if (entry.ty_args.length == 0) {
          console.log("no ty_args", ctx.version)
          ctx.meter.Counter("no_type_args").add(1)
          return
        }

        const coinTypeStruct = entry.ty_args[0] as TxnBuilderTypes.TypeTagStruct
        const moduleAddress = uintArrayToAddress(coinTypeStruct.value.address.address)

        const coin =  moduleAddress + "::" + coinTypeStruct.value.module_name.value + "::" + coinTypeStruct.value.name.value

        // if (coin !== "0x1::aptos_coin::AptosCoin") {
        //   return
        // }
        const tokenInfo = tokenMap.get(coin)
        if (!tokenInfo) {
          return
        }

        // const to = bytesToNumber(entry.args[0]).toString(16)
        const amount = bytesToNumber(entry.args[1]).scaleDown(tokenInfo.decimals)
        // console.log(evt.guid.account_address, to, amount)

        const price = await getPrice(coin, parseInt(ctx.transaction.timestamp))
        if (price === 0) {
          console.log(coin, ctx.transaction.timestamp)
        }
        const value = amount.multipliedBy(price)

        movement.add(ctx, amount, { coin: tokenInfo.symbol })

        ctx.eventLogger.emit("Transaction", {
          distinctId: evt.guid.account_address,
          function: entry.function_name.value,
          symbol: tokenInfo.symbol,
          sender: tx.sender.toHexString().toString(),
          coin,
          amount,
          value
        })
      })

  // 3. Momentum Safe failed registration
  // https://explorer.aptoslabs.com/txn/0x3df4a5048d0348593b36046420b9fef3dcf26092d62e7029458b32ad35868469/events
  env.creator.bind({startVersion})
    .onEntryInitWalletCreation(async (call, ctx) => {
      const events = await ctx.coder.filterAndDecodeEvents(
          env.registry.OwnerMomentumSafesChangeEvent.type(),  ctx.transaction.events)
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
        ctx.eventLogger.emit("Deploy", {
          distinctId: address,
          account: address
        })
        ctx.meter.Counter("num_deploys").add(1)
        // ctx.logger.info(`deploy use msafe: version: ${ctx.version} , sender: ${ctx.transaction.sender} `)
      }
    })
}

function bytesToNumber(byteArray: Uint8Array) {
  return BigInt("0x" + Buffer.from(byteArray.reverse()).toString('hex'));

  //
  // let result = 0n;
  // for (let i = byteArray.length - 1; i >= 0; i--) {
  //   result = (result * 256n) + BigInt(byteArray[i]);
  // }

  // return result;
}
function uintArrayToAddress(uintArray: Uint8Array) {
  return "0x" + Buffer.from(uintArray).toString('hex')
  // return "0x"+uintArray.reduce((acc, byte) => (acc << 8n) + BigInt(byte), 0n).toString(16);
}
