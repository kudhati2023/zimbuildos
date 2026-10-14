# Node.js 20 Minimal Hardened Production Container
FROM node:20-alpine AS build

WORKDIR /usr/src/app

# Install build dependencies
COPY package*.json ./
# --omit=dev (npm >= 7). The old --only=production flag is ignored by current npm and pulled in dev
# dependencies such as embedded-postgres.
RUN npm ci --omit=dev

COPY . .

# Unprivileged runtime user
USER node

EXPOSE 5000

ENV NODE_ENV=production

CMD ["node", "src/server.js"]
