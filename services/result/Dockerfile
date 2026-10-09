FROM node:18-alpine
COPY shared /app/shared
WORKDIR /app/shared
RUN npm install --omit=dev
WORKDIR /app/services/result
COPY services/result/package.json ./package.json
RUN npm install --omit=dev
COPY services/result/src ./src
ENV NODE_ENV=production SERVICE_NAME=result-service
EXPOSE 3005
CMD ["node", "src/index.js"]
