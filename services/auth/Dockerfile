FROM node:18-alpine
COPY shared /app/shared
WORKDIR /app/shared
RUN npm install --omit=dev
WORKDIR /app/services/auth
COPY services/auth/package.json ./package.json
RUN npm install --omit=dev
COPY services/auth/src ./src
ENV NODE_ENV=production SERVICE_NAME=auth-service
EXPOSE 3001
CMD ["node", "src/index.js"]
