FROM node:22-slim

# git é necessário porque uma dependência do Baileys vem direto do GitHub
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src

ENV NODE_ENV=production
ENV DATA_DIR=/data
CMD ["node", "src/whatsapp.js"]
