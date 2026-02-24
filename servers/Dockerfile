# ---------------------------------------------------------
# MCP Servers Unified "Fat Image"
# ---------------------------------------------------------
FROM node:20-slim

ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    CI=true

# Install supervisor and required build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    supervisor \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN npm install -g pnpm

WORKDIR /app

# ---------------------------------------------------------
# 1. Base Structure for MCP Servers
# ---------------------------------------------------------
# Copy servers code
COPY freqtrade-mcp-server /app/servers/freqtrade-mcp-server

# Build Freqtrade MCP
WORKDIR /app/servers/freqtrade-mcp-server
RUN pnpm install && pnpm build

# ---------------------------------------------------------
# 2. Supervisor Setup for Process Management
# ---------------------------------------------------------
WORKDIR /app
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose ports that Supervisord uses for the background MCP servers
# Port 3001: Freqtrade MCP Server
EXPOSE 3001

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
