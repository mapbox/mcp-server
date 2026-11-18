# Builds @mapbox/mcp-server from servers/mcp-server, with the repo root as
# the build context: docker build -t mapbox-mcp-server .
FROM node:22-slim AS build

# pnpm at the packageManager version in package.json.
RUN corepack enable

WORKDIR /repo

# Install dependencies - completely skip install scripts during Docker build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY servers/mcp-server/package.json servers/mcp-server/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @mapbox/mcp-server...

# Copy the server and build it. Without dist/version.json (git isn't in the
# image), the server reads its version from package.json.
COPY servers/mcp-server servers/mcp-server
RUN pnpm --filter @mapbox/mcp-server exec tshy

# Production dependencies and the build, without workspace symlinks
RUN pnpm --filter @mapbox/mcp-server deploy --prod --legacy --ignore-scripts /app

FROM node:22-slim

# Remove gnutls from the runtime image. libgnutls30 is only depended on by apt,
# which is not needed at runtime. Force-remove after all apt operations are done.
RUN dpkg --remove --force-depends libgnutls30

# Upgrade npm to fix CVE-2026-33750 (brace-expansion < 2.0.3 bundled in npm 10.x)
RUN npm install -g npm@11.16.0

WORKDIR /app
COPY --from=build /app ./

# Command to run the server
CMD ["node", "dist/esm/index.js"]
