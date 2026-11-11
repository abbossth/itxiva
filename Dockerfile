# syntax=docker/dockerfile:1.7
# ITXiva — production image (Next.js standalone). GitHub Actions'da build qilinadi, VPS faqat ishga tushiradi.

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM node:24-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Brauzerga build vaqtida kiradigan (maxfiy bo'lmagan) qiymatlar va versiya
ARG GIT_SHA=dev
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_ARENA_WS_URL
ENV GIT_SHA=$GIT_SHA \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_ARENA_WS_URL=$NEXT_PUBLIC_ARENA_WS_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-slim AS runner
WORKDIR /app
ARG GIT_SHA=dev
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    GIT_SHA=$GIT_SHA \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/version').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
