FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY api ./api
EXPOSE 3001
CMD ["node", "api/server.js"]
