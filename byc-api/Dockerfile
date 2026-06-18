FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /data
ENV DATABASE_PATH=/data/byc.db
EXPOSE 3000
CMD ["node", "src/index.js"]
