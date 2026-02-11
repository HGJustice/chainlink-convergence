import { EVMClient, type Runtime, getNetwork } from "@chainlink/cre-sdk";
import type { Config } from "../../types/config";

export function getEvmClient(
  runtime: Runtime<Config>,
  isTestnet: boolean,
): EVMClient {
  const evmConfig = runtime.config.evms[0];

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: evmConfig.chainName,
    isTestnet,
  });

  if (!network) {
    throw new Error(`Unknown chain name: ${evmConfig.chainName}`);
  }

  return new EVMClient(network.chainSelector.selector);
}
