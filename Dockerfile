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
# 1. Copy and Build custom MCP servers
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
