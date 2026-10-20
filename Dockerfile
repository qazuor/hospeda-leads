ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE} AS build
WORKDIR /app

# Coolify can expose NODE_ENV=production at build time. The frontend build
# needs Vite/Tsup from devDependencies, so force development semantics here.
ENV NODE_ENV=development

COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dist-server ./dist-server
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --from=build --chown=node:node /app/scripts ./scripts

USER node
EXPOSE 3001
# Migrate, then exec node so the server is PID 1 and receives SIGTERM (graceful shutdown in src/server/index.ts).
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node dist-server/index.js"]
