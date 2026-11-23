FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p uploads/tickets uploads/broadcasts

ENV NODE_ENV=production
EXPOSE 3004

CMD ["node", "server.js"]
