FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate && pnpm install --frozen-lockfile

# Install web dependencies
COPY web/package.json ./web/
RUN cd web && pnpm install

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/web/node_modules ./web/node_modules
COPY package.json pnpm-lock.yaml tsconfig.json ./
COPY web ./web
COPY src ./src
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate && pnpm build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
COPY package.json ./
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "dist/index.js"]
