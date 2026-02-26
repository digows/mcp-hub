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
mcp_server_extra.json ← Mounted from ConfigMap (external servers, no rebuild needed)
        ↓ merge
mcp_server.json       ← Final config read by mcp-proxy-server
```

This means:
- **Custom servers** (like Freqtrade) are versioned with the code and always active.
- **External servers** can be added/removed via `kubectl apply` without triggering a new image build.

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

## Custom Servers (Built-in)

Custom servers live in `servers/` and are compiled into the image. They are defined in `mcp_server.json` at the repo root and always active.

### Freqtrade MCP Server

Exposes 43 tools from the Freqtrade REST API via STDIO transport. Tools are prefixed with the server key by the proxy:

| Tool (as exposed) | Description |
|---|---|
| `freqtrade__ping` | Health check |
| `freqtrade__status` | Current open trades |
| `freqtrade__balance` | Wallet balance |
| `freqtrade__profit` | Cumulative profit stats |
| `freqtrade__reconcile_state` | Aggregated status snapshot |
| `freqtrade__force_enter` | Open a trade (Risk Gated) |
| `freqtrade__force_exit` | Close a trade |
| `freqtrade__validate_trade` | Pre-flight risk check |
| … and 35+ more | See `SIMPLE_GET_TOOLS` in `index.ts` |

### Adding a New Custom Server

1. Create a new directory under `servers/my-new-server/`
2. Implement an MCP STDIO server (any language/runtime)
3. Add an entry to `mcp_server.json`:
   ```json
   {
     "mcpServers": {
       "freqtrade": { "..." },
       "my-new-server": {
         "type": "stdio",
         "command": "node",
         "args": ["/mcp-proxy-server/servers/my-new-server/build/index.js"],
         "active": true
       }
     }
   }
   ```
4. Update the `Dockerfile` to copy and build the new server
5. Commit and push — CI will build and push the new image

---

## External Servers (Runtime via ConfigMap)

You can wire in external MCP servers already running in your cluster (or anywhere reachable) **without rebuilding the image**.

Edit the `mcp_server_extra.json` key in `configmap.yml` in the K8s manifests repo:

```yaml
# apps/mcp/configmap.yml
data:
  mcp_server_extra.json: |
    {
      "mcpServers": {
        "n8n": {
          "type": "sse",
          "url": "http://n8n.n8n.svc.cluster.local:3000/sse",
          "active": true
        },
        "home-assistant": {
          "type": "sse",
          "url": "http://homeassistant.homeassistant.svc.cluster.local:8123/mcp_server/sse",
          "active": true
        }
      }
    }
```

Then apply:
```sh
kubectl apply -f apps/mcp/configmap.yml --context homeserver
kubectl rollout restart deployment/mcp-hub -n mcp --context homeserver
```

The `mcpServers` from both configs are merged. Keys in `mcp_server_extra.json` **override** base keys with the same name.

---

## Kubernetes Configuration

### ConfigMap (non-sensitive)

| Key | Default | Description |
|---|---|---|
| `PORT` | `3663` | Proxy HTTP port |
| `ENABLE_ADMIN_UI` | `true` | Enable management dashboard |
| `FREQTRADE_PUBLIC_URL` | `https://freqtrade.home.digows.com/api/v1` | Freqtrade API base URL |
| `mcp_server_extra.json` | `{}` | Extra servers config (see above) |

### Secret (sensitive)

| Key | Description |
|---|---|
| `FREQTRADE_USERNAME` | Freqtrade API username |
| `FREQTRADE_PASSWORD` | Freqtrade API password |
| `ADMIN_USERNAME` | Dashboard login username |
| `ADMIN_PASSWORD` | Dashboard login password |
| `SESSION_SECRET` | Cookie signing key — generate with `openssl rand -hex 32` |
| `ALLOWED_KEYS` | API key for `/sse` and `/mcp` endpoints (via `X-Api-Key` header or `?key=` query) |

---

## Endpoints

| Endpoint | Description |
|---|---|
| `https://mcp-hub.home.digows.com/` | Management dashboard (login required) |
| `https://mcp-hub.home.digows.com/sse` | Unified SSE endpoint for MCP clients |
| `https://mcp-hub.home.digows.com/mcp` | Streamable HTTP (MCP protocol) |

Authentication: pass `X-Api-Key: <ALLOWED_KEYS value>` or `?key=<value>`.

---

## CI/CD

On every push to `main`, GitHub Actions builds and pushes the image to:
```
ghcr.io/digows/mcp-hub:latest
ghcr.io/digows/mcp-hub:sha-<commit>
```

The Kubernetes deployment uses `imagePullPolicy: Always`, so a `rollout restart` picks up the new image without changing manifests.
