# ---------------------------------------------------------
# MCP Hub - Fat Image using mcp-proxy-server
# ---------------------------------------------------------
FROM ghcr.io/ptbsare/mcp-proxy-server/mcp-proxy-server:0.4.1

WORKDIR /mcp-proxy-server

# CI mode prevents pnpm from prompting on TTY-less environments
ENV CI=true

# ------------------------------------------------------------------
# 1. Install System Dependencies
# ------------------------------------------------------------------
USER root
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm for building custom servers
RUN npm install -g pnpm

# ------------------------------------------------------------------
# 2. Install npm-based MCP servers
# ------------------------------------------------------------------

# n8n-mcp: bridges n8n workflows as MCP tools
# better-sqlite3 is required by n8n-mcp for its local state cache
RUN npm install -g n8n-mcp better-sqlite3

# Research Tools (Kukapay & Community - Node versions)
RUN npm install -g git+https://github.com/kukapay/dexscreener-trending-mcp.git \
    && npm install -g git+https://github.com/kukapay/crypto-indicators-mcp.git

# ------------------------------------------------------------------
# 3. Install Python-based MCP servers
# ------------------------------------------------------------------
# We use --break-system-packages because this is a dedicated container
RUN pip3 install --break-system-packages \
    git+https://github.com/kukapay/crypto-feargreed-mcp.git \
    git+https://github.com/kukapay/cryptopanic-mcp-server.git

# Disable n8n-mcp telemetry at build time
RUN N8N_MCP_TELEMETRY_DISABLED=true npx n8n-mcp telemetry disable || true

# ------------------------------------------------------------------
# 4. Copy and Build custom MCP servers (local source)
# ------------------------------------------------------------------
COPY servers/freqtrade-mcp-server /mcp-proxy-server/servers/freqtrade-mcp-server
WORKDIR /mcp-proxy-server/servers/freqtrade-mcp-server
RUN pnpm install && pnpm build

# ------------------------------------------------------------------
# 5. Bake in the base server config
# ------------------------------------------------------------------
WORKDIR /mcp-proxy-server
COPY mcp_server.json /mcp-proxy-server/config/mcp_server.base.json

# ------------------------------------------------------------------
# 6. Copy the entrypoint merge script
# ------------------------------------------------------------------
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3663

ENTRYPOINT ["/docker-entrypoint.sh"]
