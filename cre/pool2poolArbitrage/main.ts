import {
  CronCapability,
  handler,
  Runner,
  type Runtime,
  consensusMedianAggregation,
} from "@chainlink/cre-sdk";
import type { Config } from "./types/config";
import type { PoolState } from "./types/poolState";
import { getPool, convertSqrtPriceX96 } from "./lib/poolFunctions";
import { getETHMarketPrice } from "./lib/getETHMarketPrice";
import { hookAddress, tokenAddress } from "./constants/contractAddresses";

const initWorkflow = (config: Config) => {
  const cron = new CronCapability();

  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
};

const onCronTrigger = (runtime: Runtime<Config>): PoolState => {
  const pool = getPool(
    runtime,
    false,
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    undefined,
    3000,
    60,
  );
  const real = convertSqrtPriceX96(pool.sqrtPriceX96, 18, 6);
  runtime.log(real.toString());

  return pool;
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
