FROM node:18-alpine
COPY shared /app/shared
WORKDIR /app/shared
RUN npm install --omit=dev
WORKDIR /app/services/gateway
COPY gateway/package.json ./package.json
RUN npm install --omit=dev
COPY gateway/src ./src
COPY frontend /app/services/frontend
ENV NODE_ENV=production SERVICE_NAME=api-gateway
EXPOSE 8080
CMD ["node", "src/index.js"]
