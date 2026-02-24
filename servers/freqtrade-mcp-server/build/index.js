"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const sse_js_1 = require("@modelcontextprotocol/sdk/server/sse.js");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const client_js_1 = require("./client.js");
const risk_engine_js_1 = require("./risk-engine.js");
const fs_1 = __importDefault(require("fs"));
// File-based simple audit log
const AUDIT_LOG_FILE = process.env.AUDIT_LOG_FILE || '/tmp/freqtrade_audit.jsonl';
function logAudit(action, details) {
    const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        action,
        details
    }) + '\n';
    fs_1.default.appendFileSync(AUDIT_LOG_FILE, entry);
}
const server = new index_js_1.Server({
    name: 'freqtrade-mcp-server',
    version: '1.0.0',
}, {
    capabilities: {
        tools: {},
    },
});
// Map of read-only GET tools that don't require parameters
const SIMPLE_GET_TOOLS = [
    'ping', 'version', 'health', 'sysinfo', 'logs', 'balance', 'status',
    'trades', 'count', 'performance', 'profit', 'profit_all', 'stats',
    'daily', 'weekly', 'monthly', 'entries', 'exits', 'mix_tags',
    'markets', 'available_pairs', 'strategies', 'plot_config', 'exchanges',
    'hyperoptloss', 'freqaimodels', 'whitelist', 'blacklist', 'locks',
    'backtest_status', 'backtest_history', 'backtest_history_result',
    'background_jobs', 'pairlists_available'
];
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
    return {
        tools: [
            ...SIMPLE_GET_TOOLS.map(name => ({
                name: `freqtrade.${name}`,
                description: `Fetch ${name} from Freqtrade`,
                inputSchema: { type: 'object', properties: {} },
            })),
            {
                name: 'freqtrade.show_config',
                description: 'Fetch Freqtrade config (sanitized)',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'freqtrade.reconcile_state',
                description: 'Consolidate status, count, profit, and balance',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'freqtrade.start',
                description: 'Start the bot',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'freqtrade.stop',
                description: 'Stop the bot',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'freqtrade.pause',
                description: 'Pause the bot (prevent new entries)',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'freqtrade.reload_config',
                description: 'Reload bot configuration',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'freqtrade.validate_trade',
                description: 'Validate a trade using the internal Risk Engine',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pair: { type: 'string' },
                        side: { type: 'string', enum: ['long', 'short'] },
                        edge_reason: { type: 'string' },
                        max_slippage_pct: { type: 'number' }
                    },
                    required: ['pair', 'side', 'edge_reason']
                },
            },
            {
                name: 'freqtrade.force_enter',
                description: 'Force enter a trade (Risk Gated)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pair: { type: 'string' },
                        side: { type: 'string', enum: ['long', 'short'] },
                        edge_reason: { type: 'string' },
                        confirm_if_needed: { type: 'boolean' }
                    },
                    required: ['pair', 'side', 'edge_reason']
                },
            },
            {
                name: 'freqtrade.force_exit',
                description: 'Force exit a trade',
                inputSchema: {
                    type: 'object',
                    properties: {
                        tradeid: { type: 'number' },
                        edge_reason: { type: 'string' }
                    },
                    required: ['tradeid', 'edge_reason']
                },
            }
        ]
    };
});
function standardizeResponse(ok, data, errorCode) {
    if (ok) {
        return {
            content: [{ type: 'text', text: JSON.stringify({ ok: true, data, meta: { timestamp: new Date().toISOString() } }, null, 2) }]
        };
    }
    return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ ok: false, error_code: errorCode || 'UPSTREAM_ERROR', data }, null, 2) }]
    };
}
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const rawName = request.params.name;
    if (!rawName.startsWith('freqtrade.')) {
        throw new types_js_1.McpError(types_js_1.ErrorCode.MethodNotFound, `Unknown Freqtrade tool: ${rawName}`);
    }
    const name = rawName.replace('freqtrade.', '');
    const args = request.params.arguments || {};
    try {
        // 1. Handle simple GET tools auto-mapped
        if (SIMPLE_GET_TOOLS.includes(name)) {
            const data = await (0, client_js_1.freqtradeRequest)(`/${name}`);
            return standardizeResponse(true, data);
        }
        // 2. Custom Handlers
        switch (name) {
            case 'show_config': {
                const data = await (0, client_js_1.freqtradeRequest)('/show_config');
                if (data.api_server) {
                    delete data.api_server.password;
                    delete data.api_server.jwt_secret;
                }
                return standardizeResponse(true, data);
            }
            case 'reconcile_state': {
                const [status, count, profit, balance] = await Promise.all([
                    (0, client_js_1.freqtradeRequest)('/status'),
                    (0, client_js_1.freqtradeRequest)('/count'),
                    (0, client_js_1.freqtradeRequest)('/profit'),
                    (0, client_js_1.freqtradeRequest)('/balance')
                ]);
                return standardizeResponse(true, { status, count, profit, balance });
            }
            case 'start':
            case 'stop':
            case 'pause':
            case 'reload_config': {
                const safeEndpoint = name === 'pause' ? 'stopentry' : name; // Fallback to stopentry if pause doesn't exist depending on version
                const beforeStatus = await (0, client_js_1.freqtradeRequest)('/status');
                const data = await (0, client_js_1.freqtradeRequest)(`/${safeEndpoint}`, { method: 'POST' });
                logAudit(name, { before: beforeStatus, after: data });
                return standardizeResponse(true, data);
            }
            case 'validate_trade': {
                const validation = await (0, risk_engine_js_1.validateTrade)(String(args.pair), String(args.side), String(args.edge_reason), Number(args.max_slippage_pct || 0.4));
                return standardizeResponse(true, validation);
            }
            case 'force_enter': {
                const { pair, side, edge_reason, confirm_if_needed } = args;
                // 1. Run Validation
                const validation = await (0, risk_engine_js_1.validateTrade)(String(pair), String(side), String(edge_reason));
                if (!validation.allowed) {
                    return standardizeResponse(false, validation, 'RISK_BLOCKED');
                }
                if (validation.requires_human_confirmation && confirm_if_needed !== true) {
                    return standardizeResponse(false, validation, 'REQUIRES_CONFIRMATION');
                }
                logAudit('force_enter_pre_flight', { pair, side, edge_reason, validation });
                // 2. Execute
                const data = await (0, client_js_1.freqtradeRequest)('/forceenter', {
                    method: 'POST',
                    body: JSON.stringify({ pair, side, order_type: 'limit' }) // Freqtrade default body
                });
                logAudit('force_enter_executed', { pair, side, payload: data });
                return standardizeResponse(true, data);
            }
            case 'force_exit': {
                const { tradeid, edge_reason } = args;
                if (!edge_reason || String(edge_reason).trim() === '') {
                    return standardizeResponse(false, { message: 'edge_reason is required' }, 'VALIDATION_ERROR');
                }
                logAudit('force_exit_pre_flight', { tradeid, edge_reason });
                const data = await (0, client_js_1.freqtradeRequest)('/forceexit', {
                    method: 'POST',
                    body: JSON.stringify({ tradeid: String(tradeid) })
                });
                logAudit('force_exit_executed', { tradeid, payload: data });
                return standardizeResponse(true, data);
            }
            default:
                throw new types_js_1.McpError(types_js_1.ErrorCode.MethodNotFound, `Tool handler not implemented for ${name}`);
        }
    }
    catch (err) {
        return standardizeResponse(false, { message: err.message }, 'UPSTREAM_ERROR');
    }
});
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
let transport;
app.get('/sse', async (req, res) => {
    transport = new sse_js_1.SSEServerTransport('/message', res);
    await server.connect(transport);
    console.log('Client connected to Freqtrade MCP Server SSE endpoint.');
});
app.post('/message', async (req, res) => {
    if (transport) {
        await transport.handlePostMessage(req, res);
    }
    else {
        res.status(500).send('SSE transport not initialized. Connect to /sse first.');
    }
});
const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, () => {
    console.log(`Freqtrade MCP Server running on SSE: http://0.0.0.0:${PORT}/sse`);
});
