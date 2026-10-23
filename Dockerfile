ARG NODE_IMAGE=node:24.22.0-alpine3.24

# Build stage: compile the bot (TypeScript) and the web (Next.js standalone output). The output is plain JS, CSS and
# HTML, so it runs on the build host's platform.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# npm needs every workspace manifest; the web packages are devDependencies of web/package.json.
COPY package.json package-lock.json .npmrc ./
COPY web/package.json ./web/
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY web ./web
RUN npx tsc -p tsconfig.build.json --sourceMap false && npm run web:build

# Dependency stage: production dependencies only (no web package: they are all devDependencies, and the web runs
# from its own traced node_modules). The guard keeps this stage valid for every target platform: it fails the
# build when a runtime package needs an install script or is os/cpu specific.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY web/package.json ./web/
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force && rm -f node_modules/perry-web
RUN node -e "\
const lock = JSON.parse(require('node:fs').readFileSync('package-lock.json', 'utf8'));\
const bad = Object.entries(lock.packages).filter(([name, p]) => name !== '' && !p.dev && !p.devOptional && (p.hasInstallScript || p.os || p.cpu));\
if (bad.length > 0) { console.error('Runtime package needs a native build or is platform specific: ' + bad.map(([name]) => name).join(', ')); process.exit(1); }"

# Runtime stage: the bot (node dist/index.js) and the web dashboard (node web-standalone/start.cjs) share this image.
FROM ${NODE_IMAGE}
ARG VERSION=dev
ARG REVISION=unknown
ARG SOURCE_URL=""
LABEL org.opencontainers.image.title="perry" \
      org.opencontainers.image.description="Discord bot with music, moderation and leveling, plus a web dashboard" \
      org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"
ENV NODE_ENV=production \
    PERRY_VERSION=${VERSION} \
    AUTO_MIGRATE=true \
    REGISTER_COMMANDS_ON_START=true \
    HEARTBEAT_FILE=/tmp/perry-heartbeat \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/web/.next/standalone ./web-standalone
COPY --chown=node:node package.json ./
COPY --chown=node:node drizzle ./drizzle
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 CMD ["node", "dist/healthcheck.js"]
STOPSIGNAL SIGTERM
CMD ["node", "dist/index.js"]
