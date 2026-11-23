FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json ./
RUN bun install --production

COPY tsconfig.json ./
COPY src ./src

ENV PORT=7860
ENV USE_HF_CDN=true
EXPOSE 7860

CMD ["bun", "run", "src/index.ts"]
