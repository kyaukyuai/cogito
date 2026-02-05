FROM oven/bun:1.3.8

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production

COPY . .

CMD ["bun", "run", "src/daemon.ts"]
