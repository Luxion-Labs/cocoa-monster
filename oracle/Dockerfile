FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY contract/package.json ./contract/package.json
COPY oracle/package.json ./oracle/package.json
RUN npm install --legacy-peer-deps

COPY contract ./contract
RUN npm run build --workspace cocoa-contract

COPY oracle ./oracle

WORKDIR /app/oracle
ENV ORACLE_HOST=0.0.0.0
ENV ORACLE_PORT=8787
ENV ORACLE_DATA_DIR=/data
EXPOSE 8787
CMD ["npm", "start"]
