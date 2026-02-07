import type { EvmConfig } from "./evmConfig";

export type Config = {
  schedule: string;
  apiUrl: string;
  evms: EvmConfig[];
};
