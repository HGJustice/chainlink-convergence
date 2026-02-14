// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseHook} from "v4-hooks-public/src/base/BaseHook.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolId} from "v4-core/types/PoolId.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {SwapParams, ModifyLiquidityParams} from "v4-core/types/PoolOperation.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {TransientStateLibrary} from "@uniswap/v4-core/src/libraries/TransientStateLibrary.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {CurrencySettler} from "@uniswap/v4-core/test/utils/CurrencySettler.sol";

contract ArbHook is BaseHook {
    using StateLibrary for IPoolManager;
    using TransientStateLibrary for IPoolManager;
    using CurrencySettler for Currency;

    uint256 public ethArbProfit = 0;
    uint256 public usdcArbProfit = 0;
    address public cre_address;
    PoolKey public otherV4Pool;

    constructor(
        IPoolManager _poolManager,
        address _cre_address,
        PoolKey memory _otherV4Pool
    ) BaseHook(_poolManager) {
        cre_address = _cre_address;
        otherV4Pool = _otherV4Pool;
    }

    error NotHookManagerAddress();
    error OnlyPoolManagerAccess();

    event PoolPriceUpdated(uint160 newsSqrtPriceX96, int24 newCurrentTick);

    function _afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata,
        BalanceDelta,
        bytes calldata
    ) internal override returns (bytes4, int128) {
        (uint160 sqrtPriceX96, int24 currentTick, , ) = poolManager.getSlot0(
            key.toId()
        );
        emit PoolPriceUpdated(sqrtPriceX96, currentTick);

        return (this.afterSwap.selector, 0);
    }

    function _afterDonate(
        address,
        PoolKey calldata,
        uint256 amount0,
        uint256 amount1,
        bytes calldata
    ) internal override returns (bytes4) {
        ethArbProfit += amount0;
        usdcArbProfit += amount1;

        return this.afterDonate.selector;
    }

    function swapHookPoolWithOtherPool(
        PoolKey calldata hookKey,
        PoolKey calldata otherPoolKey,
        uint256 amount
    ) external {
        if (msg.sender != cre_address) {
            revert NotHookManagerAddress();
        }
        bytes memory data = abi.encode(hookKey, otherPoolKey, amount);
        poolManager.unlock(data);
    }

    function _unlockCallback(
        bytes calldata data
    ) internal override returns (bytes memory) {
        if (msg.sender != address(poolManager)) {
            revert OnlyPoolManagerAccess();
        }

        (
            PoolKey memory hookKey,
            PoolKey memory otherPoolKey,
            uint256 amount
        ) = abi.decode(data, (PoolKey, PoolKey, uint256));

        poolManager.swap(
            otherPoolKey,
            SwapParams({
                zeroForOne: false,
                amountSpecified: int256(amount),
                sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );

        poolManager.swap(
            hookKey,
            SwapParams({
                zeroForOne: true,
                amountSpecified: -int256(amount),
                sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            ""
        );

        int256 delta0 = poolManager.currencyDelta(
            address(this),
            hookKey.currency0
        );
        int256 delta1 = poolManager.currencyDelta(
            address(this),
            hookKey.currency1
        );

        uint256 donateAmount0 = delta0 > 0 ? uint256(delta0) : 0;
        uint256 donateAmount1 = delta1 > 0 ? uint256(delta1) : 0;

        poolManager.donate(hookKey, donateAmount0, donateAmount1, "");

        int256 remainingDelta0 = poolManager.currencyDelta(
            address(this),
            hookKey.currency0
        );
        int256 remainingDelta1 = poolManager.currencyDelta(
            address(this),
            hookKey.currency1
        );

        if (remainingDelta0 < 0) {
            hookKey.currency0.settle(
                poolManager,
                address(this),
                uint256(-remainingDelta0),
                false
            );
        } else {
            hookKey.currency0.take(
                poolManager,
                address(this),
                uint256(remainingDelta0),
                false
            );
        }

        if (remainingDelta1 < 0) {
            hookKey.currency1.settle(
                poolManager,
                address(this),
                uint256(-remainingDelta1),
                false
            );
        } else {
            hookKey.currency1.take(
                poolManager,
                address(this),
                uint256(remainingDelta1),
                false
            );
        }

        return "";
    }

    function getHookPermissions()
        public
        pure
        override
        returns (Hooks.Permissions memory)
    {
        return
            Hooks.Permissions({
                beforeInitialize: false,
                afterInitialize: false,
                beforeAddLiquidity: false,
                beforeRemoveLiquidity: false,
                afterAddLiquidity: false,
                afterRemoveLiquidity: false,
                beforeSwap: false,
                afterSwap: true,
                beforeDonate: false,
                afterDonate: true,
                beforeSwapReturnDelta: false,
                afterSwapReturnDelta: false,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            });
    }
}
