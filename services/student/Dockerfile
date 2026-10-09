FROM node:18-alpine
COPY shared /app/shared
WORKDIR /app/shared
RUN npm install --omit=dev
WORKDIR /app/services/student
COPY services/student/package.json ./package.json
RUN npm install --omit=dev
COPY services/student/src ./src
ENV NODE_ENV=production SERVICE_NAME=student-service
EXPOSE 3002
CMD ["node", "src/index.js"]
