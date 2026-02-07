import {
  CronCapability,
  handler,
  Runner,
  type Runtime,
  consensusMedianAggregation,
} from "@chainlink/cre-sdk";
import type { Config } from "./types/config";
import type { PoolState } from "./types/poolState";
import { getPoolPrice } from "./lib/getPoolPrices";
import { hookAddress, tokenAddress } from "./constants/contractAddresses";

const initWorkflow = (config: Config) => {
  const cron = new CronCapability();

  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
};

const onCronTrigger = (runtime: Runtime<Config>): PoolState => {
  const { sqrtPriceX96, currentTick, currentLiquidity } = getPoolPrice(
    runtime,
    tokenAddress,
    hookAddress,
    3000,
    60,
  );

  runtime.log(`sqrtPriceX96: ${sqrtPriceX96}`);
  runtime.log(`currentTick: ${currentTick}`);
  runtime.log(`currentLiquidity: ${currentLiquidity}`);

  return {
    sqrtPriceX96,
    currentTick,
    currentLiquidity,
  };
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
