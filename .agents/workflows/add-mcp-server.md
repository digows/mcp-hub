---
description: how to add a new external MCP server to the project
---
# How to Add a New MCP Server

When a user requests to add a new MCP server, you MUST follow these 3 strict project conventions:

## Rule 1: External Repositories
If the MCP server is an external Github repository (e.g., `polymarket`, `dexscreener`):
- **DO NOT** embed or clone the repository into the local `servers/` folder.
- Instead, dynamically clone them in the `Dockerfile` during the image build process under the `/mcp-proxy-server/external-servers` directory.
- Example:
  ```dockerfile
  # In Dockerfile
  RUN git clone --depth 1 https://github.com/organization/new-mcp-server.git \
      && cd new-mcp-server \
      && pip3 install --break-system-packages .
  ```
- The `mcp_server.json` should then reference the path `/mcp-proxy-server/external-servers/[repo]/...`

## Rule 2: Custom Code
If the user provides custom code for a new server (e.g. `freqtrade-mcp-server`) or heavily forks a repo to be maintained by us:
- **DO** embed the code in the local repository under the `servers/` directory.
- Update the `Dockerfile` to `COPY` and build that new directory.
- The `mcp_server.json` should then reference the path `/mcp-proxy-server/servers/[repo]/...`

## Rule 3: Existing Docker Images / Published Packages
If the tool is distributed as an image or published package:
- Implement it globally via the `Dockerfile` (e.g. `npm install -g package`).
