FROM node:20-alpine

RUN apk add --no-cache unzip coreutils
WORKDIR /worker
COPY worker.mjs ./worker.mjs
RUN mkdir -p /workspace && chown node:node /workspace
USER node
CMD ["node", "worker.mjs"]
