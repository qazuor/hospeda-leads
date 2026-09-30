FROM node:22-alpine AS build
WORKDIR /app

# Coolify can expose NODE_ENV=production at build time. The frontend build
# needs Vite/Tsup from devDependencies, so force development semantics here.
ENV NODE_ENV=development

COPY package*.json ./
RUN npm install --include=dev
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts ./scripts

EXPOSE 3001
CMD ["npm", "start"]
