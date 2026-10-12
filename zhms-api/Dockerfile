# Node.js 20 Minimal Hardened Production Container
FROM node:20-alpine AS build

WORKDIR /usr/src/app

# Install build dependencies
COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Unprivileged runtime user
USER node

EXPOSE 5000

ENV NODE_ENV=production

CMD ["node", "src/server.js"]
