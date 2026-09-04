FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN test -f /app/dist/client/index.html

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build /app/dist/client ./dist/client
COPY --from=build /app/server.mjs ./server.mjs
RUN test -f /app/dist/client/index.html
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.mjs"]
