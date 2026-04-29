# Multi-stage build for efficient container size
FROM node:22-alpine AS builder

# Build arguments
ARG VERSION="unknown"
ARG COMMIT_SHA="unknown"
ARG BUILD_DATE="unknown"
ARG NODE_AUTH_TOKEN

# Set working directory
WORKDIR /app

# Copy package files and .npmrc for GitHub Packages auth
COPY package*.json .npmrc ./

# Configure registry auth for GitHub Packages (needed to pull @wyre-technology/* deps)
RUN echo "//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}" >> .npmrc

# Install dependencies (--ignore-scripts prevents 'prepare' from running before source is copied)
RUN npm ci --ignore-scripts

# Remove auth token from .npmrc after install
RUN sed -i '/_authToken/d' .npmrc

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Prune dev dependencies while auth is still available
RUN npm prune --omit=dev && npm cache clean --force

# Production stage
FROM node:22-alpine AS production

# Create a non-root user for security
RUN addgroup -g 1001 -S hudu && \
    adduser -S hudu -u 1001 -G hudu

# Set working directory
WORKDIR /app

# Copy built application and production node_modules from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Create logs directory
RUN mkdir -p /app/logs && chown -R hudu:hudu /app

# Switch to non-root user
USER hudu

# Expose port
EXPOSE 8080

# Health check against the actual HTTP endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV LOG_FORMAT=json
ENV MCP_TRANSPORT=http
ENV MCP_HTTP_PORT=8080
ENV MCP_HTTP_HOST=0.0.0.0
# Default to env mode for backward compatibility; set to 'gateway' for hosted deployment
ENV AUTH_MODE=env

# Define volume for logs
VOLUME ["/app/logs"]

# Start the application directly (HTTP transport doesn't need the stdio wrapper)
CMD ["node", "dist/index.js"]

# Build arguments for runtime
ARG VERSION="unknown"
ARG COMMIT_SHA="unknown"
ARG BUILD_DATE="unknown"

# Labels for metadata
LABEL maintainer="engineering@wyre.ai"
LABEL version="${VERSION}"
LABEL description="Hudu MCP Server - Model Context Protocol server for Hudu IT documentation platform"
LABEL org.opencontainers.image.title="hudu-mcp"
LABEL org.opencontainers.image.description="Model Context Protocol server for Hudu IT documentation platform"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${COMMIT_SHA}"
LABEL org.opencontainers.image.source="https://github.com/wyre-technology/hudu-mcp"
LABEL org.opencontainers.image.documentation="https://github.com/wyre-technology/hudu-mcp/blob/main/README.md"
LABEL org.opencontainers.image.url="https://github.com/wyre-technology/hudu-mcp/pkgs/container/hudu-mcp"
LABEL org.opencontainers.image.vendor="Wyre Technology"
LABEL org.opencontainers.image.licenses="Apache-2.0"
LABEL io.modelcontextprotocol.server.name="io.github.wyre-technology/hudu-mcp"
