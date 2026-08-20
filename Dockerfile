FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Default command (overridden per service in docker-compose.yml)
CMD ["node", "src/index.js"]
