FROM node:18-alpine
COPY shared /app/shared
WORKDIR /app/shared
RUN npm install --omit=dev
WORKDIR /app/services/examination
COPY services/examination/package.json ./package.json
RUN npm install --omit=dev
COPY services/examination/src ./src
ENV NODE_ENV=production SERVICE_NAME=examination-service
EXPOSE 3004
CMD ["node", "src/index.js"]
