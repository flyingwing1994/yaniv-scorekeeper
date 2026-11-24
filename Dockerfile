# --- Build van de PWA ---
FROM node:26-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm test && npm run build

# --- Runtime: Node-server zonder dependencies (node:sqlite) ---
FROM node:26-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data
WORKDIR /app
COPY server/ ./
COPY --from=web /web/dist ./public
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
