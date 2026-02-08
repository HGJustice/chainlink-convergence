import {
  CronCapability,
  handler,
  Runner,
  type Runtime,
  consensusMedianAggregation,
} from "@chainlink/cre-sdk";
import type { Config } from "./types/config";
import type { PoolState } from "./types/poolState";
import { getPoolPrice, convertSqrtPriceX96 } from "./lib/poolFunctions";
import { getETHMarketPrice } from "./lib/getETHMarketPrice";
import { hookAddress, tokenAddress } from "./constants/contractAddresses";

const initWorkflow = (config: Config) => {
  const cron = new CronCapability();

  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
};

const onCronTrigger = (runtime: Runtime<Config>): PoolState => {
  const pool = getPoolPrice(runtime, tokenAddress, hookAddress, 3000, 60);
  const real = convertSqrtPriceX96(pool.sqrtPriceX96);
  runtime.log(real.toString());

  return pool;
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
