# standup-shark - single Node process, serves static client + WebSocket server.
FROM node:20-alpine

WORKDIR /app

# Install production deps first (leverages Docker layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy the app source. .dockerignore keeps node_modules, tests, git, etc. out.
COPY . .

# Fly expects the app to listen on the port it injects via PORT (default 8080).
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server/index.js"]
