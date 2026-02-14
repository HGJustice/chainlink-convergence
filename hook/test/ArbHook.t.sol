pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {PoolSwapTest} from "v4-core/test/PoolSwapTest.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {PoolManager} from "v4-core/PoolManager.sol";
import {SwapParams, ModifyLiquidityParams} from "v4-core/types/PoolOperation.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Currency, CurrencyLibrary} from "v4-core/types/Currency.sol";
import {PoolId} from "v4-core/types/PoolId.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {SqrtPriceMath} from "v4-core/libraries/SqrtPriceMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {ArbHook} from "../src/ArbHook.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import "forge-std/console.sol";

contract TestArbHook is Test, Deployers {
    MockERC20 token;
    Currency ethCurrency = Currency.wrap(address(0));
    Currency tokenCurrency;
    ArbHook hook;
    PoolKey otherPoolKey;
    PoolKey hookPoolKey;

    function setUp() public {
        deployFreshManagerAndRouters();

        token = new MockERC20("USDC", "USDC", 6);
        tokenCurrency = Currency.wrap(address(token));

        token.mint(address(this), 1000 ether);
        token.mint(address(1), 1000 ether);
        vm.deal(address(this), 1000 ether);
        vm.deal(address(hook), 10 ether);
        token.mint(address(hook), 1000e6);

        token.approve(address(swapRouter), type(uint256).max);
        token.approve(address(modifyLiquidityRouter), type(uint256).max);

        uint256 ethToAdd = 100 ether;

        (otherPoolKey, ) = initPool(
            ethCurrency,
            tokenCurrency,
            IHooks(address(0)),
            500,
            SQRT_PRICE_1_1
        );

        address hookAddress = address(
            uint160(Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_DONATE_FLAG)
        );
        deployCodeTo(
            "ArbHook.sol",
            abi.encode(manager, address(this), otherPoolKey),
            address(hookAddress)
        );
        hook = ArbHook(address(hookAddress));

        (hookPoolKey, ) = initPool(
            ethCurrency,
            tokenCurrency,
            hook,
            3000,
            SQRT_PRICE_1_1
        );

        uint160 sqrtPriceAtTickUpper = TickMath.getSqrtPriceAtTick(60);
        uint128 liquidityDelta = LiquidityAmounts.getLiquidityForAmount0(
            SQRT_PRICE_1_1,
            sqrtPriceAtTickUpper,
            ethToAdd
        );
        modifyLiquidityRouter.modifyLiquidity{value: ethToAdd}(
            hookPoolKey,
            ModifyLiquidityParams({
                tickLower: -60,
                tickUpper: 60,
                liquidityDelta: int256(uint256(liquidityDelta)),
                salt: bytes32(0)
            }),
            ZERO_BYTES
        );

        uint160 sqrtPriceAtTickUpper2 = TickMath.getSqrtPriceAtTick(10);
        uint128 liquidityDelta2 = LiquidityAmounts.getLiquidityForAmount0(
            SQRT_PRICE_1_1,
            sqrtPriceAtTickUpper2,
            ethToAdd
        );
        modifyLiquidityRouter.modifyLiquidity{value: ethToAdd}(
            otherPoolKey,
            ModifyLiquidityParams({
                tickLower: -10,
                tickUpper: 10,
                liquidityDelta: int256(uint256(liquidityDelta2)),
                salt: bytes32(0)
            }),
            ZERO_BYTES
        );
    }

    function test_afterSwapEvent() public {
        vm.expectEmit(true, true, false, false);
        emit ArbHook.PoolPriceUpdated(0, 0);

        swapRouter.swap{value: 0.5 ether}(
            hookPoolKey,
            SwapParams({
                zeroForOne: true,
                amountSpecified: -0.5 ether,
                sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            PoolSwapTest.TestSettings({
                takeClaims: false,
                settleUsingBurn: false
            }),
            ""
        );
    }

    function test_arbExecution() public {
        // First push the hook pool price by doing a big swap
        swapRouter.swap{value: 1 ether}(
            hookPoolKey,
            SwapParams({
                zeroForOne: true,
                amountSpecified: -1 ether,
                sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            PoolSwapTest.TestSettings({
                takeClaims: false,
                settleUsingBurn: false
            }),
            ""
        );

        // Now there should be a price difference between the two pools
        // Execute the arb
        hook.swapHookPoolWithOtherPool(hookPoolKey, otherPoolKey, 0.1 ether);

        // Check that profits were donated
        uint256 ethProfit = hook.ethArbProfit();
        uint256 usdcProfit = hook.usdcArbProfit();
        console.log("ETH profit:", ethProfit);
        console.log("USDC profit:", usdcProfit);
        assertTrue(ethProfit > 0 || usdcProfit > 0, "No profit donated");
    }
}
