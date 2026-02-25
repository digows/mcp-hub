# ---------------------------------------------------------
# MCP Hub - Fat Image using mcp-proxy-server
# ---------------------------------------------------------
FROM ghcr.io/ptbsare/mcp-proxy-server/mcp-proxy-server:0.4.1

# Set working directory (usually /app in this image)
WORKDIR /app

# Install dependencies needed for our Freqtrade server
# The base image already has node, but we might need pnpm
RUN npm install -g pnpm

# 1. Copy and Build Freqtrade MCP Server
COPY servers/freqtrade-mcp-server /app/servers/freqtrade-mcp-server
WORKDIR /app/servers/freqtrade-mcp-server
RUN pnpm install && pnpm build

# 2. Configure the Proxy Hub
# The proxy expects its config in /app/config/mcp_server.json
WORKDIR /app
COPY mcp_server.json /app/config/mcp_server.json

# Expose the default proxy port (usually 3000)
# The image handles its own startup via its built-in entrypoint
EXPOSE 3000
