import {
  CronCapability,
  handler,
  Runner,
  type Runtime,
  consensusMedianAggregation,
} from "@chainlink/cre-sdk";
import { parseEther } from "viem";
import type { Config } from "./types/config";
import type { PoolState } from "./types/poolState";
import { getPool, convertSqrtPriceX96, getQuote } from "./lib/poolFunctions";
import { getETHMarketPrice } from "./lib/getETHMarketPrice";
import { hookAddress, tokenAddress } from "./constants/contractAddresses";

const initWorkflow = (config: Config) => {
  const cron = new CronCapability();

  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
};

const onCronTrigger = (runtime: Runtime<Config>): bigint => {
  const result = getQuote(
    runtime,
    false,
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    500,
    10,
    undefined,
    true,
    parseEther(String(1)),
  );

  return result;
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
