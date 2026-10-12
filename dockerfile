# Stage 1: build frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: backend
FROM node:22-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ .
COPY --from=frontend-builder /app/frontend/dist ./public

ENV NODE_ENV=production
EXPOSE 5000
CMD ["node", "server.js"]