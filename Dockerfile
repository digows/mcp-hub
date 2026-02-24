# Use a versatile base image since we need Python (freqtrade) and Node.js (n8n, gateway)
FROM ubuntu:24.04

# Prevent interactive prompts during apt-get
ENV DEBIAN_FRONTEND=noninteractive

# Update and install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    python3 \
    python3-pip \
    python3-venv \
    supervisor \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js (v20 is generally safe for n8n and modern node apps)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm

# Set up working directory
WORKDIR /app

# ---------------------------------------------------------
# 1. Build and install MCP Gateway Registry
# ---------------------------------------------------------
COPY mcp-gateway-registry /app/mcp-gateway-registry
WORKDIR /app/mcp-gateway-registry
RUN pnpm install && pnpm build

# ---------------------------------------------------------
# 2. Build and install N8N
# ---------------------------------------------------------
WORKDIR /app
COPY servers/n8n-mcp-server /app/n8n-mcp-server
WORKDIR /app/n8n-mcp-server
# Setup depends on exactly how the official n8n repo builds,
# often pnpm install && pnpm build
RUN pnpm install && pnpm build

# ---------------------------------------------------------
# 3. Build and install Freqtrade (Python)
# ---------------------------------------------------------
WORKDIR /app
COPY servers/freqtrade-mcp-server /app/freqtrade-mcp-server
WORKDIR /app/freqtrade-mcp-server
RUN python3 -m venv .venv \
    && . .venv/bin/activate \
    && pip install -r requirements.txt || true \
    && pip install -e .

# ---------------------------------------------------------
# 4. Supervisor Setup for Process Management
# ---------------------------------------------------------
WORKDIR /app
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose ports (Gateway usually runs on 3000, n8n on 5678, etc. Adjust as needed)
EXPOSE 3000
EXPOSE 5678

# Command to run supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
