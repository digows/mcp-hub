#!/bin/sh
set -e

BASE_CONFIG="/mcp-proxy-server/config/mcp_server.base.json"
EXTRA_CONFIG="/mcp-proxy-server/config/mcp_server_extra.json"
FINAL_CONFIG="/mcp-proxy-server/config/mcp_server.json"

echo "[entrypoint] Merging MCP server configurations..."

node -e "
const fs = require('fs');

const base = JSON.parse(fs.readFileSync('${BASE_CONFIG}', 'utf8'));

let extra = { mcpServers: {} };
try {
  const raw = fs.readFileSync('${EXTRA_CONFIG}', 'utf8').trim();
  if (raw && raw !== '{}') {
    extra = JSON.parse(raw);
    console.error('[entrypoint] Extra config loaded from ConfigMap');
  }
} catch (e) {
  console.error('[entrypoint] No extra config found, using base only');
}

const merged = {
  ...base,
  mcpServers: {
    ...base.mcpServers,
    ...(extra.mcpServers || {})
  }
};

fs.writeFileSync('${FINAL_CONFIG}', JSON.stringify(merged, null, 2));

const servers = Object.keys(merged.mcpServers);
console.error('[entrypoint] Active servers (' + servers.length + '): ' + servers.join(', '));
"

echo "[entrypoint] Starting MCP Proxy Server..."
exec node /mcp-proxy-server/build/sse.js
