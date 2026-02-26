# ---------------------------------------------------------
# MCP Hub - Fat Image using mcp-proxy-server
# ---------------------------------------------------------
FROM ghcr.io/ptbsare/mcp-proxy-server/mcp-proxy-server:0.4.1

WORKDIR /mcp-proxy-server

# CI mode prevents pnpm from prompting on TTY-less environments
ENV CI=true

# ------------------------------------------------------------------
# 1. Install System Dependencies (Python + Git)
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
# 2. Add Built-in MCP Servers (Subfolders)
# ------------------------------------------------------------------

# Frequencytrade custom server
COPY servers/freqtrade-mcp-server /mcp-proxy-server/servers/freqtrade-mcp-server
WORKDIR /mcp-proxy-server/servers/freqtrade-mcp-server
RUN pnpm install && pnpm build

# ------------------------------------------------------------------
# 3. Add Research MCP Servers (Kukapay - Cloned for stability)
# ------------------------------------------------------------------
WORKDIR /mcp-proxy-server/external-servers

# Node-based research tools
RUN git clone --depth 1 https://github.com/kukapay/dexscreener-trending-mcp.git \
    && cd dexscreener-trending-mcp && npm install

RUN git clone --depth 1 https://github.com/kukapay/crypto-indicators-mcp.git \
    && cd crypto-indicators-mcp && npm install

# Python-based research tools
# Using pip3 install -e or just installing requirements
RUN git clone --depth 1 https://github.com/kukapay/crypto-feargreed-mcp.git \
    && cd crypto-feargreed-mcp && pip3 install --break-system-packages .

RUN git clone --depth 1 https://github.com/kukapay/cryptopanic-mcp-server.git \
    && cd cryptopanic-mcp-server && pip3 install --break-system-packages .

# ------------------------------------------------------------------
# 4. Global Tools
# ------------------------------------------------------------------
# n8n-mcp is a stable public package
RUN npm install -g n8n-mcp better-sqlite3

# Disable n8n-mcp telemetry at build time
RUN N8N_MCP_TELEMETRY_DISABLED=true npx n8n-mcp telemetry disable || true

# ------------------------------------------------------------------
# 5. Configuration Setup
# ------------------------------------------------------------------
WORKDIR /mcp-proxy-server
COPY mcp_server.json /mcp-proxy-server/config/mcp_server.base.json

# Copy the entrypoint merge script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3663

ENTRYPOINT ["/docker-entrypoint.sh"]
