
# Stage 1: Cài đặt dependencies và biên dịch Backend
FROM node:24-bookworm-slim AS builder

WORKDIR /app

# Cài đặt các thư viện hệ thống cần thiết cho Prisma và native modules
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Cài dependencies theo package-lock.json
COPY package.json package-lock.json ./
RUN npm ci

# Sao chép source code và cấu hình
COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

# Generate Prisma Client trước khi biên dịch TypeScript
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    npx prisma generate

RUN npm run build

# Stage 2: Chạy Backend đã biên dịch
FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Chỉ giữ các dependencies cần thiết khi chạy ứng dụng
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Sao chép JavaScript đã build và Prisma Client
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.js"]
