import { parseEther } from "viem";
import type { Config } from "../types/config";
import { consensusMedianAggregation, type Runtime } from "@chainlink/cre-sdk";
import { getETHMarketPrice } from "../lib/getETHMarketPrice";
import { getQuote } from "../lib/poolFunctions";

const PROFIT_THRESHOLD = 1_000_000;
const BASE_GAS_COST = parseEther("0.00003");

export function calculateTradeProfit(runtime: Runtime<Config>): string {
  runtime.log("=== Starting Arbitrage Detection ===\n");
  const ethUSDCSpotPrice = runtime
    .runInNodeMode(getETHMarketPrice, consensusMedianAggregation())()
    .result();
  runtime.log(`ETH Market Price: $${(ethUSDCSpotPrice / 1e6).toFixed(2)}`);
  const gasCostInUSDC =
    (BASE_GAS_COST * BigInt(ethUSDCSpotPrice)) / BigInt(1e18);
  runtime.log(
    `Estimated Gas Cost: $${(Number(gasCostInUSDC) / 1e6).toFixed(4)}`,
  );
  runtime.log("\n--- Fetching Pool Prices ---");
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
  runtime.log(
    `Other Pool (0.05% fee): ${(Number(pool1Price) / 1e6).toFixed(6)} USDC per ETH`,
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
  runtime.log(
    `Hook Pool (0.3% fee): ${(Number(poolHookPrice) / 1e6).toFixed(6)} USDC per ETH`,
  );
  runtime.log("\n--- Calculating Profitability ---");

  const profitBuyHookPool = pool1Price - poolHookPrice - gasCostInUSDC;
  const profitSellHookPool = poolHookPrice - pool1Price - gasCostInUSDC;

  runtime.log("\n=== Arbitrage Decision ===");

  if (profitBuyHookPool > PROFIT_THRESHOLD) {
    runtime.log(`✅ PROFITABLE ARBITRAGE DETECTED!`);
    runtime.log(`📍 Direction: BUY from Hook Pool → SELL to Other Pool`);
    runtime.log(`🎯 Executing: executeArbitrage(FromHook=true)`);

    return "0x123...arbitrage_executed_buy_from_hook";
  }

  if (profitSellHookPool > PROFIT_THRESHOLD) {
    runtime.log(`✅  PROFITABLE ARBITRAGE DETECTED!`);
    runtime.log(`📍 Direction: BUY from Other Pool → SELL to Hook Pool`);
    runtime.log(`🎯 Executing: executeArbitrage(FromHook=false)`);

    return "0x456...arbitrage_executed_buy_from_other";
  }

  return "no_arbitrage_executed";
}
