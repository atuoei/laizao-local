# laizao-local

本项目把两套已验证代码合并为一个本地开发目录：

- `frontend/`：保留来造 Next 的完整 26 页面交互前端；
- `backend/`：FastAPI + PostgreSQL 的作品、版本、上架、订单、模拟支付和权益服务；
- `docker-compose.yml`：本地数据库与后端 API 的一键启动配置。

## 第一次启动

打开两个终端。

**终端 1：后端和数据库**

```bash
cd /Users/atuoei/project/laizao-local
docker compose up --build
```

后端文档在 <http://localhost:8001/docs>。

**终端 2：来造前端**

```bash
cd /Users/atuoei/project/laizao-local/frontend
npm install
npm run dev -- --port 3001
```

打开 <http://localhost:3001>。

## 前后端如何连接

前端 API 地址由 `frontend/.env.local` 配置为 `http://localhost:8001`；统一请求代码在 `frontend/app/vibe-api.ts`。

| 前端业务 | 后端接口 |
| --- | --- |
| 市场作品列表 | `GET /v1/marketplace` |
| 发布作品 | `POST /v1/works` → 版本 → 上架 |
| 模拟购买 | 创建订单 → `simulate-paid` |
| 已购权益 | `GET /v1/me/entitlements` |

## 轻量审核与运营数据

新作品会经历 `草稿 → 待审核 → 通过／驳回`。只有审核通过的作品会出现在公开市场，也只有通过审核的作品可以下单。



| 用途 | 接口 |
| --- | --- |
| 待审核作品 | `GET /v1/admin/reviews` |
| 审核通过 | `POST /v1/admin/works/{work_id}/approve` |
| 审核驳回 | `POST /v1/admin/works/{work_id}/reject` |
| 漏斗统计 | `GET /v1/admin/analytics/funnel` |

后端事件表会自动记录 `publish_started`、`work_submitted`、`work_approved`、`purchase_clicked`、`order_created`、`payment_succeeded` 与 `entitlement_granted`。这是评选和早期运营需要的轻量数据基础；后续可以再接入专门的数据分析平台。

## 本地手机号登录

点击页面顶部的“手机号登录”，输入任意符合格式的中国大陆手机号。点击“获取验证码”后，使用固定本地验证码 `123456` 即可登录；手机号首次验证会自动注册为新用户。令牌保存在浏览器本地存储，发布作品和购买作品都会由该令牌确定用户身份。

上线前必须将 `backend/.env` 中的 `SMS_MODE=local` 替换为真实短信服务配置，并更换 `AUTH_SECRET`。本地验证码不能用于生产环境。

## 本地 ZIP 作品包上传

发布第一步选择“导入文件”后可选择 `.zip` 作品包，最大 100MB。文件上传时保存在 `backend/uploads/works/`，该目录已通过 Docker 挂载，因此重启容器不会丢失文件。

- 后端只保存 ZIP，不会解压或执行其中内容。
- 作品作者和已获得作品权益的买家才能通过下载接口访问文件。
- 发布后仍需经过管理员审核；审核通过后买家购买可在“我的权益”中获得交付。
- 该目录就是未来腾讯云服务器上的本地磁盘目录；接入 COS 时可替换存储层，不改发布审核流程。

`app/page.tsx` 是来造原型的全部页面入口。后续接入时优先替换其中的演示作品数据、作品详情、发布成功和订单/权益页面；不要接入原项目中的 Cloudflare D1 `db/` 或 `worker/`。

## 安全边界

- 真实模型 Key 只能存在 `backend/.env`，不能放入 `frontend/.env.local`。
- 生产部署时只公开 Nginx 的 `80/443`；`8000` 与 `5432` 保持内部可访问。
