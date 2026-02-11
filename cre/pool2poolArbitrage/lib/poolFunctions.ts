import {
  type Runtime,
  LATEST_BLOCK_NUMBER,
  encodeCallMsg,
  bytesToHex,
} from "@chainlink/cre-sdk";
import {
  encodeFunctionData,
  decodeFunctionResult,
  zeroAddress,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  getAddress,
} from "viem";
import type { Config } from "../types/config";
import type { PoolState } from "../types/poolState";
import { getEvmClient } from "./utils/getEvmClient";
import {
  ethAddress,
  stateViewAddressTestnet,
  stateViewAddressMainnet,
} from "../constants/contractAddresses";
import StateViewABI from "../contracts/abi/StateView.json";
import QuoterABI from "../contracts/abi/Quoter.json";

export function getPool(
  runtime: Runtime<Config>,
  isTestnet: boolean,
  tokenAddress: string,
  hookAddress: string = "0x0000000000000000000000000000000000000000",
  fee: number,
  tickSpacing: number,
): PoolState {
  const evmClient = getEvmClient(runtime, isTestnet);

  const poolId = keccak256(
    encodeAbiParameters(
      parseAbiParameters("address, address, uint24, int24, address"),
      [
        getAddress(ethAddress),
        getAddress(tokenAddress),
        fee,
        tickSpacing,
        getAddress(hookAddress),
      ],
    ),
  );

  const slot0CallData = encodeFunctionData({
    abi: StateViewABI,
    functionName: "getSlot0",
    args: [poolId],
  });

  const liquidityCallData = encodeFunctionData({
    abi: StateViewABI,
    functionName: "getLiquidity",
    args: [poolId],
  });

  const stateViewAddress = isTestnet
    ? stateViewAddressTestnet
    : stateViewAddressMainnet;

  const slot0Result = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: stateViewAddress,
        data: slot0CallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const liquidityResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: stateViewAddress,
        data: liquidityCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const slot0 = decodeFunctionResult({
    abi: StateViewABI,
    functionName: "getSlot0",
    data: bytesToHex(slot0Result.data),
  }) as [bigint, number, bigint, bigint];

  const currentLiquidity = decodeFunctionResult({
    abi: StateViewABI,
    functionName: "getLiquidity",
    data: bytesToHex(liquidityResult.data),
  }) as bigint;

  const sqrtPriceX96 = slot0[0];
  const currentTick = slot0[1];

  return {
    sqrtPriceX96,
    currentTick,
    currentLiquidity,
  };
}

export function convertSqrtPriceX96(
  sqrtPriceX96: bigint,
  token0Decimal: number,
  token1Decimal: number,
): bigint {
  const priceX192 = sqrtPriceX96 * sqrtPriceX96;
  const decimalAdjustment = 10n ** BigInt(token0Decimal - token1Decimal);
  const PRECISION = 10n ** 18n;

  const numerator = priceX192 * decimalAdjustment * PRECISION;
  const denominator = 2n ** 96n * 2n ** 96n;

  return numerator / denominator;
}

export function getQuote(
  runtime: Runtime<Config>,
  isTestnet: boolean,
  token1Address: string,
): bigint {
  const evmClient = getEvmClient(runtime, isTestnet);

  return 10n;
}
