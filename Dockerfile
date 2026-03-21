FROM node:20-bookworm-slim AS root-deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate && pnpm install --frozen-lockfile

FROM node:20-bookworm-slim AS web-deps
WORKDIR /app/web
COPY web/package.json web/pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate && pnpm install --frozen-lockfile

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=root-deps /app/node_modules ./node_modules
COPY --from=web-deps /app/web/node_modules ./web/node_modules
COPY package.json pnpm-lock.yaml tsconfig.json ./
COPY src ./src
COPY web ./web
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate && pnpm build

FROM node:20-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate && pnpm install --prod --frozen-lockfile

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
COPY package.json ./
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "dist/index.js"]
