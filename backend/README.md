# Vibe Market 后端（第一阶段）

这是与现有前端原型分离的后端服务。它负责保存作品、版本、上架、模拟购买和用户权益；前端只通过 HTTP API 访问它。

## 先准备什么

- 安装 Docker Desktop（本地）或 Docker Engine（腾讯云 Ubuntu 服务器）。
- 在项目根目录执行一次：

```bash
cd /Users/atuoei/project/youware-marketplace
cp backend/.env.example backend/.env
docker compose up --build
```

启动成功后，打开 [API 文档](http://localhost:8000/docs)，先不用写代码也能点按钮测试接口。

> `backend/.env` 保存数据库地址和 AI Key，绝不能提交到 Git。当前 `AI_PROVIDER=mock`，所以无需 API Key 也能演示 AI 摘要。

## 最短演示流程

1. `POST /v1/auth/dev-login`，输入一个邮箱和昵称，复制返回的 `id`。
2. 以后需要登录的接口，点击 **Try it out**，在请求头填 `X-User-Id: 刚才的 id`。
3. 依次调用：创建作品 → 创建版本（放一个作品预览/交付链接）→ 上架。
4. 再用另一个邮箱登录，创建订单 → `simulate-paid`。
5. 调用 `GET /v1/me/entitlements`，确认购买者拿到了作品权益。

这条链路就是评选时最重要的“发布 → 购买 → 获得使用权”闭环。`simulate-paid` 不是真实支付，不会产生资金交易。

## 前端如何接入

前端需要维护当前登录用户 ID（仅开发阶段可放在浏览器 localStorage），并在受保护请求加上：

```ts
fetch("http://localhost:8000/v1/works", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-User-Id": currentUserId,
  },
  body: JSON.stringify({ title: "我的 Vibe 作品", description: "...", tags: ["AI", "工具"] }),
});
```

部署后，不要把 API 地址和 Key 写死在组件中。改用前端环境变量，例如 `VITE_API_BASE_URL=https://api.你的域名.com`。

## AI 接入

默认是 `mock`。要实际调用 DeepSeek，在 `backend/.env` 改为：

```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=你的密钥
```

密钥只放服务器的 `backend/.env`，不能放在 React/Vite 前端，也不能提交 Git。

## 腾讯云部署对应关系

本地验证通过后，把整个 `youware-marketplace` 项目上传到服务器，在服务器执行同样的 `docker compose up -d --build`。Docker 内部运行 PostgreSQL 和 API；宝塔的 Nginx 负责把 `api.你的域名.com` 转发到 `127.0.0.1:8000`。

公网安全组只开放 `80`、`443`（以及限制来源后的 SSH/宝塔面板端口），不要开放 `5432` 或 `8000`。
