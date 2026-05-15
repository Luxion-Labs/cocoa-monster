# syntax=docker/dockerfile:1.6

# ----- deps: install workspace deps + Compact compiler -----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates xz-utils \
 && rm -rf /var/lib/apt/lists/*
RUN curl --proto '=https' --tlsv1.2 -LsSf \
      https://github.com/midnightntwrk/compact/releases/download/compact-v0.2.0/compact-installer.sh | sh
ENV PATH="/root/.local/bin:${PATH}"
RUN compact update

COPY package.json package-lock.json* ./
COPY contract/package.json ./contract/
COPY ui/package.json ./ui/
RUN npm install --legacy-peer-deps

# ----- build: compile contract + bundle UI -----
FROM deps AS build
COPY contract ./contract
RUN cd contract && npm run compact && npm run build
COPY ui ./ui
RUN cd ui && npm run build

# ----- runtime: serve static bundle via nginx -----
FROM nginx:1.27-alpine
COPY --from=build /app/ui/dist /usr/share/nginx/html
COPY images/cocoa-monster/nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
