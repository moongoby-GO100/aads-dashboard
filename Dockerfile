FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# The PC Agent login recovery flow depends on this static callback. Keep an
# explicit copy/check so a stale broad COPY cache cannot silently omit it.
COPY public/e2e-auth.html /app/public/e2e-auth.html
RUN test -s /app/public/e2e-auth.html
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
RUN apk add --no-cache tzdata && cp /usr/share/zoneinfo/Asia/Seoul /etc/localtime && echo 'Asia/Seoul' > /etc/timezone
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/public/e2e-auth.html ./public/e2e-auth.html
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3100
ENV PORT=3100
CMD ["node", "server.js"]
