# ---------------------------------------------------------
# MCP Hub - Fat Image using mcp-proxy-server
# ---------------------------------------------------------
FROM ghcr.io/ptbsare/mcp-proxy-server/mcp-proxy-server:0.4.1

WORKDIR /mcp-proxy-server

# CI mode prevents pnpm from prompting on TTY-less environments
ENV CI=true

# Install pnpm for building custom servers
RUN npm install -g pnpm

# ------------------------------------------------------------------
# 1. Install npm-based MCP servers (no custom code required)
# ------------------------------------------------------------------

# n8n-mcp: bridges n8n workflows as MCP tools (runs in STDIO mode via proxy)
# better-sqlite3 is required by n8n-mcp for its local state cache
RUN npm install -g n8n-mcp better-sqlite3

# Research Tools (Kukapay & Community) https://github.com/kukapay/kukapay-mcp-servers/blob/main/README.md
RUN npm install -g dexscreener-trending-mcp crypto-feargreed-mcp crypto-indicators-mcp cryptopanic-mcp-server

# Disable n8n-mcp telemetry at build time
RUN N8N_MCP_TELEMETRY_DISABLED=true npx n8n-mcp telemetry disable || true

# ------------------------------------------------------------------
# 2. Copy and Build custom MCP servers (local source)
# ------------------------------------------------------------------
COPY servers/freqtrade-mcp-server /mcp-proxy-server/servers/freqtrade-mcp-server
WORKDIR /mcp-proxy-server/servers/freqtrade-mcp-server
RUN pnpm install && pnpm build

# ------------------------------------------------------------------
# 2. Bake in the base server config (always-on custom servers)
#    This is the immutable base — external servers are merged at runtime
#    via /mcp-proxy-server/config/mcp_server_extra.json (from ConfigMap).
# ------------------------------------------------------------------
WORKDIR /mcp-proxy-server
COPY mcp_server.json /mcp-proxy-server/config/mcp_server.base.json

# ------------------------------------------------------------------
# 3. Copy the entrypoint merge script
# ------------------------------------------------------------------
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3663

ENTRYPOINT ["/docker-entrypoint.sh"]
