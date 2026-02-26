"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTrade = validateTrade;
const client_js_1 = require("./client.js");
async function validateTrade(pair, side, edgeReason, maxSlippagePct = 0.4) {
    const output = {
        allowed: true,
        requires_human_confirmation: true, // Always default to human confirmation for risky actions unless proven ultra-safe
        checks: {
            whitelist_ok: true,
            exposure_ok: true,
            daily_loss_ok: true,
            streak_ok: true,
            locks_ok: true,
            pause_ok: true,
            liquidity_ok: true
        },
        reasons_blocking: []
    };
    try {
        const config = await (0, client_js_1.freqtradeRequest)('/show_config');
        const status = await (0, client_js_1.freqtradeRequest)('/status');
        const profit = await (0, client_js_1.freqtradeRequest)('/profit');
        const count = await (0, client_js_1.freqtradeRequest)('/count');
        const locks = await (0, client_js_1.freqtradeRequest)('/locks');
        const whitelist = await (0, client_js_1.freqtradeRequest)('/whitelist');
        const blacklist = await (0, client_js_1.freqtradeRequest)('/blacklist');
        const daily = await (0, client_js_1.freqtradeRequest)('/daily');
        // 1. Whitelist Check
        if (!whitelist.whitelist.includes(pair)) {
            output.checks.whitelist_ok = false;
            output.reasons_blocking.push(`Pair ${pair} is not in the whitelist.`);
        }
        // 2. Blacklist Check
        if (blacklist.blacklist.includes(pair)) {
            output.checks.whitelist_ok = false;
            output.reasons_blocking.push(`Pair ${pair} is explicitly blacklisted.`);
        }
        // 3. Locks Check
        const activeLock = locks?.locks?.find((l) => l.pair === pair && l.active);
        if (activeLock) {
            output.checks.locks_ok = false;
            output.reasons_blocking.push(`Pair ${pair} is currently locked until ${activeLock.until}.`);
        }
        // 4. Exposure & Position Checks
        // Assuming config.max_open_trades exists and status has current trades
        const currentOpenTrades = status?.length || 0;
        const maxOpenTrades = config?.max_open_trades === -1 ? 999 : config?.max_open_trades || 999;
        // Check if total exposure > 15% (or based on total stake vs balance)
        // This requires balance API which isn't imported here, but we can do a simplistic count check
        if (currentOpenTrades >= maxOpenTrades) {
            output.checks.exposure_ok = false;
            output.reasons_blocking.push(`Max open trades reached (${currentOpenTrades}/${maxOpenTrades}).`);
        }
        // 5. Daily Loss Check
        const today = new Date().toISOString().split('T')[0];
        const todayStats = daily.data?.find(d => d.date === today);
        /* DISABLED
        if (todayStats && todayStats.rel_profit < -0.01) {
            output.checks.daily_loss_ok = false;
            output.reasons_blocking.push(`Daily loss limit reached (${todayStats.rel_profit * 100}%). Blocking new trades.`);
        }
        */
        // 6. Drawdown Check
        /* DISABLED
        if (profit?.profit_factor < 0.95 || (profit?.winning_trades === 0 && profit?.losing_trades > 3)) {
            output.checks.daily_loss_ok = false;
            output.reasons_blocking.push(`Drawdown or losing streaks detected. Safety pause active.`);
        }
        */
        // 7. Slippage/Liquidity
        /* DISABLED
        if (maxSlippagePct > 0.4) {
            output.checks.liquidity_ok = false;
            output.reasons_blocking.push(`Slippage projection (${maxSlippagePct}%) exceeds maximum allowed (0.4%).`);
        }
        */
        // 8. No Edge Reason provided
        if (!edgeReason || edgeReason.trim() === '') {
            output.allowed = false;
            output.reasons_blocking.push(`No edge_reason provided. "Eu não invento trades."`);
        }
        // Aggregate allowed state
        const allChecksPass = Object.values(output.checks).every(v => v === true);
        if (!allChecksPass) {
            output.allowed = false;
        }
    }
    catch (err) {
        output.allowed = false;
        output.reasons_blocking.push(`Failed to validate trade context: ${err.message}`);
    }
    return output;
}
