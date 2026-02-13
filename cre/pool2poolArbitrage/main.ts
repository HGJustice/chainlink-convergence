import {
  CronCapability,
  handler,
  Runner,
  type Runtime,
  consensusMedianAggregation,
} from "@chainlink/cre-sdk";
import type { Config } from "./types/config";
import { calculateTradeProfit } from "./lib/arbitrageFunctions";
import { getETHMarketPrice } from "./lib/getETHMarketPrice";

const initWorkflow = (config: Config) => {
  const cron = new CronCapability();

  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
};

const onCronTrigger = (runtime: Runtime<Config>): string => {
  const result = calculateTradeProfit(runtime);

  return result;
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
