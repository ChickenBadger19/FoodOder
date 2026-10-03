# Foodify: API + built PWA in one container. Data lives in /data (mount a volume).
# Build from the repo root: docker build -f apps/web/Dockerfile -t foodify .
FROM node:22-bookworm AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/app/package.json packages/app/
COPY packages/core/package.json packages/core/
COPY packages/retailers/package.json packages/retailers/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @foodify/web build

FROM node:22-bookworm-slim
RUN corepack enable
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production PORT=8787 FOODIFY_DB=/data/foodify.sqlite
VOLUME ["/data"]
EXPOSE 8787
WORKDIR /app/apps/api
CMD ["pnpm", "start"]
