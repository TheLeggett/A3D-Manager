# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-slim AS production

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodejs

# Copy package files
COPY package*.json ./

# Install production dependencies only
# Sharp requires additional setup for prebuilt binaries
RUN npm ci --omit=dev

# Copy built frontend from builder stage
COPY --chown=nodejs:nodejs --from=builder /app/dist ./dist

# Copy server source (tsx runs TypeScript directly)
COPY --chown=nodejs:nodejs --from=builder /app/server ./server

# Copy tsconfig files for tsx
COPY --chown=nodejs:nodejs --from=builder /app/tsconfig.json ./
COPY --chown=nodejs:nodejs --from=builder /app/tsconfig.server.json ./

# Copy data files (cart name database)
COPY --chown=nodejs:nodejs --from=builder /app/data ./data

# Create local data directory with correct permissions
RUN mkdir -p .local/Library/N64/Games .local/Library/N64/Images && \
    chown -R nodejs:nodejs .local

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:3001/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the server
CMD ["npm", "start"]
