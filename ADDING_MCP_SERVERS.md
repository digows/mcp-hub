# Adding MCP Servers

This project follows a strict 3-tier standard when integrating new Model Context Protocol (MCP) servers.

Depending on the nature of the MCP server you are adding, follow the appropriate standard below:

## 1. External Repositories (e.g. `polymarket-mcp-server`)
If the MCP server is an external repository that we do not own or maintain:
- **Rule**: **DO NOT** embed or copy the repository code into our local `/servers` folder.
- **Implementation**: It must be dynamically cloned and installed during the Docker build process within `Dockerfile`.
- **Example (`Dockerfile`)**:
  ```dockerfile
  RUN git clone --depth 1 https://github.com/caiovicentino/polymarket-mcp-server.git \
      && cd polymarket-mcp-server \
      && pip3 install --break-system-packages .
  ```
- **Example (`mcp_server.json`)**:
  Configure the service to point to `/mcp-proxy-server/external-servers/[repo-name]/...` depending on where it was cloned in the Docker image.

## 2. Custom MCP Servers (e.g. `freqtrade-mcp-server`)
If the MCP server is custom code written specifically for our infrastructure, or is a heavy customization/fork of an existing project:
- **Rule**: **DO** embed the source code physically in our repository under the `servers/` directory.
- **Implementation**: The `Dockerfile` already contains `COPY servers/[name] /mcp-proxy-server/servers/[name]` routines (or similar) that will copy and install this embedded code.
- **Example (`mcp_server.json`)**:
  Configure the service to point to `/mcp-proxy-server/servers/[repo-name]/...`

## 3. Existing Docker Images
If an MCP server is already distributed as a compiled Docker Image:
- **Rule**: Encapsulate the tool directly via our project's `Dockerfile`.
- **Implementation**: Depending on the image, you may install its corresponding package globally via `npm` or `pip`, or copy its binaries over using multi-stage builds.
- **Example (`n8n-mcp`)**:
  ```dockerfile
  RUN npm install -g n8n-mcp
  ```
