FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY server.cjs ./

ENV PORT=80
EXPOSE 80

CMD ["npm", "start"]
