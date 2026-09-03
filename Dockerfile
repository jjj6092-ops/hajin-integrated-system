FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY hajin-app.tar.gz /tmp/hajin-app.tar.gz
RUN tar -xzf /tmp/hajin-app.tar.gz -C /app
RUN npm install
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build /app/dist/client ./dist/client
COPY --from=build /app/server.mjs ./server.mjs
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.mjs"]
