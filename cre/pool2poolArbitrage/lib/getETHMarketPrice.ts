import {
  CronCapability,
  HTTPClient,
  handler,
  consensusMedianAggregation,
  Runner,
  type NodeRuntime,
  type Runtime,
} from "@chainlink/cre-sdk";
import type { Config } from "../types/config";

export function getETHMarketPrice(nodeRuntime: NodeRuntime<Config>): number {
  const httpClient = new HTTPClient();

  const req = {
    url: nodeRuntime.config.apiUrl,
    method: "GET" as const,
  };

  const resp = httpClient.sendRequest(nodeRuntime, req).result();
  const bodyText = new TextDecoder().decode(resp.body);
  const data = JSON.parse(bodyText);
  const priceUsd = data.ethereum.usd;
  const priceWith6Decimals = Math.floor(priceUsd * 1000000);

  return priceWith6Decimals;
}
