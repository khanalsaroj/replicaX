FROM node:20-alpine
WORKDIR /web
COPY . .
RUN npm ci && npm run build
