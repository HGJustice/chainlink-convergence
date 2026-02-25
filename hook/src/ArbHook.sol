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

    int24 public constant MIN_TICK_DIVERGENCE = 10;

    uint256 public ethArbProfit = 0;
    uint256 public usdcArbProfit = 0;
    address public cre_address;
    PoolKey public otherV4Pool;

    error NotHookManagerAddress();
    error OnlyPoolManagerAccess();

    event PriceDivergenceDetected();

    constructor(
        IPoolManager _poolManager,
        address _cre_address,
        PoolKey memory _otherV4Pool
    ) BaseHook(_poolManager) {
        cre_address = _cre_address;
        otherV4Pool = _otherV4Pool;
    }

    function _afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata,
        BalanceDelta,
        bytes calldata
    ) internal override returns (bytes4, int128) {
        (, int24 currentTickHook, , ) = poolManager.getSlot0(key.toId());

        (, int24 currentTickHookOtherPool, , ) = poolManager.getSlot0(
            otherV4Pool.toId()
        );

        int24 tickDivergence = currentTickHook > currentTickHookOtherPool
            ? currentTickHook - currentTickHookOtherPool
            : currentTickHookOtherPool - currentTickHook;

        if (tickDivergence >= MIN_TICK_DIVERGENCE) {
            emit PriceDivergenceDetected();
        }

        return (this.afterSwap.selector, 0);
    }

    function executeArbitrage(
        PoolKey calldata hookKey,
        bool fromHook,
        uint256 amount
    ) external {
        if (msg.sender != cre_address) {
            revert NotHookManagerAddress();
        }
        bytes memory data = abi.encode(hookKey, fromHook, amount);
        poolManager.unlock(data);
    }

    function unlockCallback(
        bytes calldata data
    ) external onlyPoolManager returns (bytes memory) {
        (PoolKey memory hookKey, bool fromHook, uint256 amount) = abi.decode(
            data,
            (PoolKey, bool, uint256)
        );

        if (fromHook) {
            BalanceDelta swap1Delta = poolManager.swap(
                hookKey,
                SwapParams({
                    zeroForOne: false,
                    amountSpecified: -int256(amount),
                    sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
                }),
                ""
            );

            uint256 ethReceived = uint256(uint128(swap1Delta.amount0()));

            poolManager.swap(
                otherV4Pool,
                SwapParams({
                    zeroForOne: true,
                    amountSpecified: -int256(ethReceived),
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

            (delta0, delta1) = _donateProfit(hookKey, delta0, delta1);

            _settleTakeFees(hookKey, delta0, delta1);
        } else {
            BalanceDelta swap1Delta = poolManager.swap(
                otherV4Pool,
                SwapParams({
                    zeroForOne: false,
                    amountSpecified: -int256(amount),
                    sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
                }),
                ""
            );

            uint256 ethReceived = uint256(uint128(swap1Delta.amount0()));

            poolManager.swap(
                hookKey,
                SwapParams({
                    zeroForOne: true,
                    amountSpecified: -int256(ethReceived),
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

            (delta0, delta1) = _donateProfit(hookKey, delta0, delta1);

            _settleTakeFees(hookKey, delta0, delta1);
        }

        return "";
    }

    function _donateProfit(
        PoolKey memory hookKey,
        int256 delta0,
        int256 delta1
    ) internal returns (int256, int256) {
        uint256 donateAmount0 = delta0 > 0 ? uint256(delta0) : 0;
        uint256 donateAmount1 = delta1 > 0 ? uint256(delta1) : 0;

        if (donateAmount0 > 0 || donateAmount1 > 0) {
            ethArbProfit += donateAmount0;
            usdcArbProfit += donateAmount1;
            poolManager.donate(hookKey, donateAmount0, donateAmount1, "");

            delta0 = poolManager.currencyDelta(
                address(this),
                hookKey.currency0
            );
            delta1 = poolManager.currencyDelta(
                address(this),
                hookKey.currency1
            );
        }

        return (delta0, delta1);
    }

    function _settleTakeFees(
        PoolKey memory hookKey,
        int256 delta0,
        int256 delta1
    ) internal {
        if (delta0 < 0) {
            hookKey.currency0.settle(
                poolManager,
                address(this),
                uint256(-delta0),
                false
            );
        } else if (delta0 > 0) {
            hookKey.currency0.take(
                poolManager,
                address(this),
                uint256(delta0),
                false
            );
        }

        if (delta1 < 0) {
            hookKey.currency1.settle(
                poolManager,
                address(this),
                uint256(-delta1),
                false
            );
        } else if (delta1 > 0) {
            hookKey.currency1.take(
                poolManager,
                address(this),
                uint256(delta1),
                false
            );
        }
    }

    receive() external payable {}

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
                afterDonate: false,
                beforeSwapReturnDelta: false,
                afterSwapReturnDelta: false,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            });
    }
}
