import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import cors from 'cors';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { freqtradeRequest } from './client.js';
import fs from 'fs';

// File-based simple audit log
const AUDIT_LOG_FILE = process.env.AUDIT_LOG_FILE || '/tmp/freqtrade_audit.jsonl';

function logAudit(action: string, details: any) {
    const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        action,
        details
    }) + '\n';
    try {
        fs.appendFileSync(AUDIT_LOG_FILE, entry);
    } catch (e) {
        console.error(`Failed to write to audit log: ${e}`);
    }
}

const server = new Server(
    {
        name: 'freqtrade-mcp-server',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

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

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            ...SIMPLE_GET_TOOLS.map(name => ({
                name: name,
                description: `Fetch ${name} from Freqtrade`,
                inputSchema: { type: 'object', properties: {} },
            })),
            {
                name: 'show_config',
                description: 'Fetch Freqtrade config (sanitized)',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'reconcile_state',
                description: 'Consolidate status, count, profit, and balance',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'start',
                description: 'Start the bot',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'stop',
                description: 'Stop the bot',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'pause',
                description: 'Pause the bot (prevent new entries)',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'reload_config',
                description: 'Reload bot configuration',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'force_enter',
                description: 'Force enter a trade',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pair: { type: 'string' },
                        side: { type: 'string', enum: ['long', 'short'] },
                        edge_reason: { type: 'string' }
                    },
                    required: ['pair', 'side', 'edge_reason']
                },
            },
            {
                name: 'force_exit',
                description: 'Force exit a trade',
                inputSchema: {
                    type: 'object',
                    properties: {
                        tradeid: { type: 'number' },
                        edge_reason: { type: 'string' }
                    },
                    required: ['tradeid', 'edge_reason']
                },
            },
            {
                name: 'get_trade',
                description: 'Get a specific trade by ID',
                inputSchema: {
                    type: 'object',
                    properties: { tradeid: { type: 'number' } },
                    required: ['tradeid']
                }
            },
            {
                name: 'delete_trade',
                description: 'Delete a trade from the database',
                inputSchema: {
                    type: 'object',
                    properties: { tradeid: { type: 'number' } },
                    required: ['tradeid']
                }
            },
            {
                name: 'delete_lock',
                description: 'Delete a lock by ID',
                inputSchema: {
                    type: 'object',
                    properties: { lockid: { type: 'number' } },
                    required: ['lockid']
                }
            },
            {
                name: 'pair_candles',
                description: 'Get candle data (OHLCV) for a pair and timeframe',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pair: { type: 'string' },
                        timeframe: { type: 'string' }
                    },
                    required: ['pair', 'timeframe']
                }
            },
            {
                name: 'pair_history',
                description: 'Get candle history for a pair and timeframe with optional timerange and strategy',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pair: { type: 'string' },
                        timeframe: { type: 'string' },
                        timerange: { type: 'string' },
                        strategy: { type: 'string' },
                        trading_mode: { type: 'string' },
                        margin_mode: { type: 'string' }
                    },
                    required: ['pair', 'timeframe', 'timerange']
                }
            },
            {
                name: 'download_data',
                description: 'Download data from exchange',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pairs: { type: 'array', items: { type: 'string' } },
                        timeframes: { type: 'array', items: { type: 'string' } },
                        timerange: { type: 'string' },
                        trading_mode: { type: 'string' },
                        margin_mode: { type: 'string' }
                    },
                    required: ['pairs', 'timeframes']
                }
            },
            {
                name: 'evaluate_pairlists',
                description: 'Evaluate active pairlists',
                inputSchema: { type: 'object', properties: {} }
            },
            {
                name: 'start_backtest',
                description: 'Start a backtest',
                inputSchema: {
                    type: 'object',
                    properties: {
                        strategy: { type: 'string' },
                        timeframe: { type: 'string' },
                        timerange: { type: 'string' },
                        freqaimodel: { type: 'string' }
                    },
                    required: ['strategy']
                }
            },
            {
                name: 'abort_backtest',
                description: 'Abort running backtest',
                inputSchema: { type: 'object', properties: {} }
            }
        ]
    };
});

function standardizeResponse(ok: boolean, data: any, errorCode?: string) {
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

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const knownTools = [...SIMPLE_GET_TOOLS, 'show_config', 'reconcile_state', 'start', 'stop', 'pause', 'reload_config', 'force_enter', 'force_exit', 'get_trade', 'delete_trade', 'delete_lock', 'pair_candles', 'pair_history', 'download_data', 'evaluate_pairlists', 'start_backtest', 'abort_backtest'];
    if (!knownTools.includes(name)) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown Freqtrade tool: ${name}`);
    }
    const args = request.params.arguments || {};

    try {
        // 1. Handle simple GET tools auto-mapped
        if (SIMPLE_GET_TOOLS.includes(name)) {
            const data = await freqtradeRequest(`/${name}`);
            return standardizeResponse(true, data);
        }

        // 2. Custom Handlers
        switch (name) {
            case 'show_config': {
                const data = await freqtradeRequest<any>('/show_config');
                if (data.api_server) {
                    delete data.api_server.password;
                    delete data.api_server.jwt_secret;
                }
                return standardizeResponse(true, data);
            }

            case 'reconcile_state': {
                const [status, count, profit, balance] = await Promise.all([
                    freqtradeRequest('/status'),
                    freqtradeRequest('/count'),
                    freqtradeRequest('/profit'),
                    freqtradeRequest('/balance')
                ]);
                return standardizeResponse(true, { status, count, profit, balance });
            }

            case 'start':
            case 'stop':
            case 'pause':
            case 'reload_config': {
                const safeEndpoint = name === 'pause' ? 'stopentry' : name;
                const beforeStatus = await freqtradeRequest('/status');
                const data = await freqtradeRequest(`/${safeEndpoint}`, { method: 'POST' });
                logAudit(name, { before: beforeStatus, after: data });
                return standardizeResponse(true, data);
            }

            case 'force_enter': {
                const { pair, side, edge_reason } = args;

                if (!edge_reason || String(edge_reason).trim() === '') {
                    return standardizeResponse(false, { message: 'edge_reason is required' }, 'VALIDATION_ERROR');
                }

                logAudit('force_enter_pre_flight', { pair, side, edge_reason });

                // Execute
                const data = await freqtradeRequest('/forceenter', {
                    method: 'POST',
                    body: JSON.stringify({ pair, side, order_type: 'limit' })
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

                const data = await freqtradeRequest('/forceexit', {
                    method: 'POST',
                    body: JSON.stringify({ tradeid: String(tradeid) })
                });

                logAudit('force_exit_executed', { tradeid, payload: data });
                return standardizeResponse(true, data);
            }

            case 'get_trade':
                return standardizeResponse(true, await freqtradeRequest(`/trade/${args.tradeid}`));

            case 'delete_trade':
                logAudit('delete_trade', { tradeid: args.tradeid });
                return standardizeResponse(true, await freqtradeRequest(`/trades/${args.tradeid}`, { method: 'DELETE' }));

            case 'delete_lock':
                logAudit('delete_lock', { lockid: args.lockid });
                return standardizeResponse(true, await freqtradeRequest(`/locks/${args.lockid}`, { method: 'DELETE' }));

            case 'pair_candles':
                return standardizeResponse(true, await freqtradeRequest('/pair_candles', {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(args) // Passing in body for GET might be needed by some APIs, but often query params. Freqtrade uses GET with no body or query params if missing. Actually, freqtrade expects GET params. Let's send as GET params.
                    // Wait, freqtradeRequest doesn't support query params directly. It uses fetch.
                    // We need to pass them in the URL.
                }).catch(async () => {
                    // Fallback: append as query string
                    const query = new URLSearchParams(args as Record<string, string>).toString();
                    return await freqtradeRequest(`/pair_candles?${query}`);
                }));

            case 'pair_history': {
                const query = new URLSearchParams(args as Record<string, string>).toString();
                return standardizeResponse(true, await freqtradeRequest(`/pair_history?${query}`));
            }

            case 'download_data':
                return standardizeResponse(true, await freqtradeRequest('/download_data', { method: 'POST', body: JSON.stringify(args) }));

            case 'evaluate_pairlists':
                return standardizeResponse(true, await freqtradeRequest('/pairlists/evaluate', { method: 'POST' }));

            case 'start_backtest':
                return standardizeResponse(true, await freqtradeRequest('/backtest', { method: 'POST', body: JSON.stringify(args) }));

            case 'abort_backtest':
                return standardizeResponse(true, await freqtradeRequest('/backtest/abort'));

            default:
                throw new McpError(ErrorCode.MethodNotFound, `Tool handler not implemented for ${name}`);
        }
    } catch (err: any) {
        return standardizeResponse(false, { message: err.message }, 'UPSTREAM_ERROR');
    }
});

// Transport Selection Logic
const TRANSPORT = process.env.MCP_TRANSPORT || 'stdio';

if (TRANSPORT === 'sse') {
    const app = express();
    app.use(cors());

    let transport: SSEServerTransport;

    app.get('/sse', async (req, res) => {
        transport = new SSEServerTransport('/message', res);
        await server.connect(transport);
        console.error('Client connected to Freqtrade MCP Server via SSE');
    });

    app.post('/message', async (req, res) => {
        if (transport) {
            await transport.handlePostMessage(req, res);
        } else {
            res.status(500).send('SSE transport not initialized');
        }
    });

    const PORT = parseInt(process.env.PORT || '3001', 10);
    app.listen(PORT, () => {
        console.error(`Freqtrade MCP Server running on SSE: http://0.0.0.0:${PORT}/sse`);
    });
} else {
    // Default to STDIO
    const transport = new StdioServerTransport();
    server.connect(transport).catch(error => {
        console.error("Failed to connect to STDIO transport:", error);
        process.exit(1);
    });
    console.error('Freqtrade MCP Server running on STDIO');
}
