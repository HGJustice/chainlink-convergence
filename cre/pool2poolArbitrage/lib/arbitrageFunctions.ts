import { parseEther } from "viem";
import type { Config } from "../types/config";
import { getQuote } from "../lib/poolFunctions";
import { getEvmClient } from "./utils/getEvmClient";
import {
  CronCapability,
  HTTPClient,
  handler,
  consensusMedianAggregation,
  Runner,
  type NodeRuntime,
  type Runtime,
} from "@chainlink/cre-sdk";
import { getETHMarketPrice } from "../lib/getETHMarketPrice";

const PROFIT_THRESHOLD = 1_000_000;
const BASE_GAS_COST = parseEther("0.00003");

export function calculateTradeProfit(
  runtime: Runtime<Config>,
  // isTestnet: boolean,
): string {
  const ethUSDCSpotPrice = runtime
    .runInNodeMode(getETHMarketPrice, consensusMedianAggregation())()
    .result();
  const gasCostInUSDC =
    (BASE_GAS_COST * BigInt(ethUSDCSpotPrice)) / BigInt(1e18);

  const pool1Price = getQuote(
    runtime,
    false,
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    500,
    10,
    undefined,
    true,
    parseEther("1"),
  );
  const poolHookPrice = getQuote(
    runtime,
    false,
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    3000,
    60,
    undefined,
    true,
    parseEther("1"),
  );

  runtime.log(ethUSDCSpotPrice.toString());
  runtime.log(gasCostInUSDC.toString());
  runtime.log(pool1Price.toString());
  runtime.log(poolHookPrice.toString());

  const profitBuyHookPool = pool1Price - poolHookPrice - gasCostInUSDC;
  const profitSellHookPool = poolHookPrice - pool1Price - gasCostInUSDC;

  runtime.log(profitBuyHookPool.toString());
  runtime.log(profitSellHookPool.toString());

  if (profitBuyHookPool > PROFIT_THRESHOLD) {
    runtime.log("buying from hook and selling at other pool");
    // if hook pool price deviates, and is above profitThreshold then, iniaitie hook smart contract function
    // where you buy from the hook, sell to other pool and donate profits back to hook pool
  }

  if (profitSellHookPool > PROFIT_THRESHOLD) {
    runtime.log("buying from other pool and selling at at our pool");
    // if other pool price deviates, and is above profitThreshold then, iniaitie smart contract function
    // where you buy from the other pool,  and sell to our hook pool and donate profits back to hook pool
  }

  return "tx hash of the smart contract write";
}
