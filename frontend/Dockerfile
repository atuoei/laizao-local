FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# 当前项目的 lock 文件尚未同步新增依赖；MVP 阶段按 package.json 解析依赖。
# 项目稳定后应重新生成 package-lock.json 并恢复 npm ci。
RUN npm install --no-audit --no-fund
COPY . .
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["./node_modules/.bin/vinext", "start", "--hostname", "0.0.0.0", "--port", "3000"]
