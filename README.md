# mcp-hub

Central hub for MCP (Model Context Protocol) servers. Built on [`ptbsare/mcp-proxy-server`](https://github.com/ptbsare/mcp-proxy-server), it aggregates one or more MCP servers behind a single SSE endpoint with a management dashboard.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  mcp-hub (Pod)                       │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │          mcp-proxy-server :3663              │    │
│  │  ┌────────────┐   ┌─────────────────────┐   │    │
│  │  │  Admin UI  │   │  SSE/MCP Endpoints  │   │    │
│  │  └────────────┘   └─────────────────────┘   │    │
│  │          │ STDIO aggregation                 │    │
│  │  ┌───────▼──────────────────────────────┐   │    │
│  │  │   freqtrade-mcp-server (subprocess)  │   │    │
│  │  │     43 tools exposed via STDIO       │   │    │
│  │  └──────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
         ▲                        ▲
  K8s ConfigMap              K8s Secret
  (non-sensitive)            (credentials)
```

### Config Merge Pattern

On every pod startup, the entrypoint script ([`docker-entrypoint.sh`](./docker-entrypoint.sh)) performs a deep merge of two config layers before starting the proxy:

```
mcp_server.base.json  ← Baked into the image (custom servers, always active)
mcp_server_extra.json ← Mounted from Secret (external servers, no rebuild needed)
        ↓ merge
mcp_server.json       ← Final config read by mcp-proxy-server
```

---

## Repository Structure

```
mcp-gateway/
├── Dockerfile                        # Fat image: proxy + custom servers
├── docker-entrypoint.sh              # Config merge + startup script
├── mcp_server.json                   # Base config (baked as mcp_server.base.json)
└── servers/
    └── freqtrade-mcp-server/         # Custom Freqtrade MCP server
        ├── src/index.ts              # Server implementation (dual STDIO/SSE)
        └── README.md                 # Freqtrade server docs
```

---

## Built-in Servers (Baked into Image)

These servers are compiled/installed into the Docker image and are defined in `mcp_server.json`.

### 1. Freqtrade MCP Server
Exposes 43 tools from your Freqtrade bot.
- **Tools**: `freqtrade__status`, `freqtrade__balance`, `freqtrade__force_enter`, etc.
- **Config**: Uses `FREQTRADE_PUBLIC_URL`, `FREQTRADE_USERNAME`, `FREQTRADE_PASSWORD`.

### 2. Research & Alpha Tools (Kukapay)
Real-time market insights and sentiment analysis.
- **DexScreener** (`dexscreener__*`): Trending pairs and liquidity data.
- **CryptoPanic** (`cryptopanic__*`): Global crypto news (requires `CRYPTOPANIC_API_KEY`).
- **Fear & Greed** (`feargreed__*`): Market sentiment index.
- **Technical Indicators** (`indicators__*`): RSI, MACD, etc.

### 3. n8n-mcp
Bridges your n8n workflows as tools.
- **Tools**: `n8n-mcp__*` (mapped from active workflows).
- **Config**: Uses `N8N_API_URL` and `N8N_API_KEY`.

---

## External Servers (Runtime via Secret)

You can wire in external MCP servers without rebuilding the image by editing `mcp_server_extra.json` in `secrets.yml`.

Example for adding `n8n-executor` (converted from MCPorter):
```json
{
  "mcpServers": {
    "n8n-executor": {
      "type": "http",
      "url": "https://n8n.home.digows.com/mcp-server/http",
      "headers": { "Authorization": "Bearer ..." },
      "active": true
    }
  }
}
```

---

## Kubernetes Configuration

### ConfigMap (non-sensitive)
- `PORT`: `3663` (Hub port)
- `ENABLE_ADMIN_UI`: `true`
- `FREQTRADE_PUBLIC_URL`: Internal bot URL.
- `N8N_API_URL`: Internal n8n URL.

### Secret (sensitive)
- `FREQTRADE_USERNAME/PASSWORD`: Bot credentials.
- `N8N_API_KEY`: For workflow access.
- `CRYPTOPANIC_API_KEY`: Optional news key.
- `ADMIN_USERNAME/PASSWORD`: Login for `https://mcp-hub.home.digows.com/`
- `ALLOWED_KEYS`: API key for external clients (pass via `X-Api-Key`).
- `mcp_server_extra.json`: JSON configuration for external servers.

---

## Endpoints
- **Admin Dashboard**: `https://mcp-hub.home.digows.com/`
- **SSE/MCP Endpoint**: `https://mcp-hub.home.digows.com/sse`
- **Authentication**: All SSE/MCP requests MUST include `X-Api-Key: <ALLOWED_KEYS_VALUE>`.
