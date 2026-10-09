FROM node:18-alpine
COPY shared /app/shared
WORKDIR /app/shared
RUN npm install --omit=dev
WORKDIR /app/services/question-bank
COPY services/question-bank/package.json ./package.json
RUN npm install --omit=dev
COPY services/question-bank/src ./src
ENV NODE_ENV=production SERVICE_NAME=question-bank-service
EXPOSE 3003
CMD ["node", "src/index.js"]
