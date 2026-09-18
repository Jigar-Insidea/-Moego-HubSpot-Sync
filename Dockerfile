FROM node:22-alpine

WORKDIR /app

# Install build dependencies for native sqlite compilation if needed
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Ensure data directory exists
RUN mkdir -p /var/data ./data

EXPOSE 10000

CMD ["npm", "start"]
