# Multi-stage build for optimized production image
# Stage 1: Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install all dependencies (including dev dependencies for build process)
RUN npm ci

# Copy application source
COPY . .

# Run tests and build (if applicable)
# RUN npm run test -- --passWithNoTests
# RUN npm run build

# Stage 2: Production stage
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Set environment variables
ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

# Expose application port
EXPOSE 3000

# Start application
CMD ["node", "src/server.js"]
