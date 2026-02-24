import { freqtradeRequest } from './client.js';

export interface ValidationOutput {
    allowed: boolean;
    requires_human_confirmation: boolean;
    checks: {
        whitelist_ok: boolean;
        exposure_ok: boolean;
        daily_loss_ok: boolean;
        streak_ok: boolean;
        locks_ok: boolean;
        pause_ok: boolean;
        liquidity_ok: boolean;
    };
    reasons_blocking: string[];
}

export async function validateTrade(
    pair: string,
    side: "long" | "short",
    edgeReason: string,
    maxSlippagePct: number = 0.4
): Promise<ValidationOutput> {
    const output: ValidationOutput = {
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
        const config = await freqtradeRequest<any>('/show_config');
        const status = await freqtradeRequest<any[]>('/status');
        const profit = await freqtradeRequest<any>('/profit');
        const count = await freqtradeRequest<any>('/count');
        const locks = await freqtradeRequest<any>('/locks');
        const whitelist = await freqtradeRequest<{ whitelist: string[] }>('/whitelist');
        const blacklist = await freqtradeRequest<{ blacklist: string[] }>('/blacklist');
        const daily = await freqtradeRequest<{ data: any[] }>('/daily');

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
        const activeLock = locks?.locks?.find((l: any) => l.pair === pair && l.active);
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
        if (todayStats && todayStats.rel_profit < -0.01) {
            output.checks.daily_loss_ok = false;
            output.reasons_blocking.push(`Daily loss limit reached (${todayStats.rel_profit * 100}%). Blocking new trades.`);
        }

        // 6. Drawdown Check
        if (profit?.profit_factor < 0.95 || (profit?.winning_trades === 0 && profit?.losing_trades > 3)) {
            output.checks.daily_loss_ok = false;
            output.reasons_blocking.push(`Drawdown or losing streaks detected. Safety pause active.`);
        }

        // 7. Slippage/Liquidity
        if (maxSlippagePct > 0.4) {
            output.checks.liquidity_ok = false;
            output.reasons_blocking.push(`Slippage projection (${maxSlippagePct}%) exceeds maximum allowed (0.4%).`);
        }

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

    } catch (err: any) {
        output.allowed = false;
        output.reasons_blocking.push(`Failed to validate trade context: ${err.message}`);
    }

    return output;
}
