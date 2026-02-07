import {
  type Runtime,
  LAST_FINALIZED_BLOCK_NUMBER,
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
import { ethAddress, stateViewAddress } from "../constants/contractAddresses";
import StateViewABI from "../contracts/abi/StateView.json";

export function getPoolPrice(
  runtime: Runtime<Config>,
  tokenAddress: string,
  hookAddress: string = "0x0000000000000000000000000000000000000000",
  fee: number,
  tickSpacing: number,
): PoolState {
  const evmClient = getEvmClient(runtime);

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
  runtime.log(`Calculated poolId: ${poolId}`);

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

  const slot0Result = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: stateViewAddress,
        data: slot0CallData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();

  const liquidityResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: stateViewAddress,
        data: liquidityCallData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
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
