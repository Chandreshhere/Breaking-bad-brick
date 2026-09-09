# Multi-stage build for Breaking Bad Brick
# Stage 1: Build frontend and backend

FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY index.html ./

# Copy functions package files
COPY functions/package*.json ./functions/
COPY functions/tsconfig.json ./functions/

# Install all dependencies (root and functions)
RUN npm ci
RUN cd functions && npm ci

# Copy source files
COPY src ./src
COPY public ./public
COPY functions/src ./functions/src

# Build frontend
RUN npm run build

# Build backend
RUN cd functions && npm run build

# Stage 2: Production image
FROM node:22-alpine

WORKDIR /app

# Copy backend package files
COPY functions/package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built backend from builder
COPY --from=builder /app/functions/lib ./lib

# Copy built frontend from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server
CMD ["node", "lib/server.js"]
