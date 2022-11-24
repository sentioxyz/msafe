import { AptosClient } from "aptos-sdk";
import { momentum_safe } from "./types/aptos/msafe";
import { momentum_safe as test_momentum_safe  } from "./types/aptos/testnet/msafe";

import { aptos } from "@sentio/sdk";
import { AptosNetwork } from "@sentio/sdk/lib/aptos";

const mainnetClient = new AptosClient("https://aptos-mainnet.nodereal.io/v1/0c58c879d41e4eab8fd2fc0406848c2b/v1")
const testnetClient = new AptosClient("https://aptos-testnet.nodereal.io/v1/6ef43ad420334714b6f3d332079ac0f4/v1")

const cache = new Map<string, boolean>()

export async function isMSafeAddress(ctx: { network: AptosNetwork, version: bigint  }, account: string) {
  const key =ctx.network.toString() +"-"+account+"-"+ctx.version.toString()
  let value = cache.get(key)
  if (value !== undefined) {
    return value
  }
  const client = ctx.network === aptos.AptosNetwork.MAIN_NET ? mainnetClient : testnetClient
  const resourceType = ctx.network === aptos.AptosNetwork.MAIN_NET ? momentum_safe.Momentum.TYPE_QNAME : test_momentum_safe.Momentum.TYPE_QNAME

  let lastError: Error | undefined

  for(let i = 0; i < 10; i++) {
    try {
      const resource = await client.getAccountResource(account, resourceType, {ledgerVersion: ctx.version})
      value = true
      break
    } catch (e) {
      lastError = e
      if (e.errorCode === 'resource_not_found') {
        value = false
        break
      }
      await delay(1000)
    }
  }
  if (value === undefined) {
    throw lastError
  }

  cache.set(key, value)
  return value
}

export function delay(ms: number) {
  return new Promise( resolve => setTimeout(resolve, ms) );
}