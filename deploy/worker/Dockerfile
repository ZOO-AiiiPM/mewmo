FROM node:22-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_HOME="/opt/corepack"

ARG PNPM_REGISTRY=https://registry.npmjs.org

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN mkdir -p "$COREPACK_HOME" \
    && corepack enable \
    && corepack prepare pnpm@11.9.0 --activate \
    && chmod -R a+rX "$COREPACK_HOME"

COPY . .

RUN --mount=type=cache,id=mewmo-pnpm,target=/pnpm/store \
    pnpm_config_registry="$PNPM_REGISTRY" \
    pnpm_config_fetch_timeout=600000 \
    pnpm_config_fetch_retries=5 \
    pnpm install --frozen-lockfile --network-concurrency=4
RUN pnpm --filter @mewmo/db db:generate
RUN chown -R node:node /app

ENV NODE_ENV=production

USER node

CMD ["pnpm", "--filter", "@mewmo/feed-ingestion", "cron:feeds"]
