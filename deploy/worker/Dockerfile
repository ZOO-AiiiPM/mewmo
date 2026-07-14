FROM node:22-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @mewmo/db db:generate
RUN chown -R node:node /app

ENV NODE_ENV=production

USER node

CMD ["pnpm", "--filter", "@mewmo/worker", "start"]
