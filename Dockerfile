FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install dependencies with frozen lockfile (no fallback to unpinned install)
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .
RUN bun run build:client

# Run as non-root user
RUN addgroup -S appuser && adduser -S appuser -G appuser
USER appuser

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "run", "start"]
