# 来造：腾讯云单机部署清单

## 上线前必须满足

- 域名已备案并解析到腾讯云 CVM 公网 IP。
- 腾讯云安全组仅开放 80、443；SSH 和宝塔面板端口限制为管理员 IP。
- Docker 与 Docker Compose 已安装。
- 当前使用账号密码登录；生产配置禁止 `SMS_MODE=local`，也不允许开发登录接口。
- 当前支付接口是**模拟支付**，不能用于真实收款。
- 静态 ZIP 和受限 Vite ZIP 可以自动部署；不接受任意 Dockerfile、Node/Python 后端 ZIP 直接运行。

## 上传并配置

在服务器将项目放到 `/opt/laizao-local`，然后：

```bash
cd /opt/laizao-local
cp .env.production.example .env
chmod 600 .env
```

编辑 `.env`，必须替换数据库密码、`AUTH_SECRET`、域名和 API 地址。`DATABASE_URL` 中的密码要和 `POSTGRES_PASSWORD` 完全一致。

## 启动与验证

```bash
sudo docker compose -f docker-compose.production.yml --env-file .env up -d --build
sudo docker compose -f docker-compose.production.yml --env-file .env ps
curl http://127.0.0.1:8000/health
curl -I http://127.0.0.1:3000
```

预期：`api`、`db`、`frontend` 均为运行状态；health 返回 `{"status":"ok"}`。
`build-worker` 也应为运行状态；它只负责 Vite 前端 ZIP 的受限构建。

## 宝塔 Nginx

创建两个站点：

- `example.com`、`www.example.com` 反向代理到 `http://127.0.0.1:3000`。
- `api.example.com` 反向代理到 `http://127.0.0.1:8000`。

在宝塔申请 SSL 后，为两个站点开启强制 HTTPS。参考规则见 `deploy/nginx-laizao.conf.example`。

## 作品子域名（可选）

使用 `作品ID-v版本.apps.example.com` 形式时：

1. DNS 添加 `*.apps.example.com` 的 A 记录到服务器 IP。
2. 申请 `*.apps.example.com` 的通配符证书（必须使用 DNS 验证），并在宝塔新增反向代理站点，规则见 `nginx-laizao.conf.example`。
3. 在 `.env` 设置 `TRIAL_SUBDOMAIN_BASE=apps.example.com`，然后重建 `api`。之后新部署的作品会得到子域名链接；旧作品重新部署一次即可更新链接。

不要把 Docker socket 或宿主机目录交给用户作品容器。全栈作品运行需要专门的受控模板与独立运行器，不属于当前单机 MVP 的自动上传范围。

## 备份与更新

- PostgreSQL 与上传文件保存在 Docker 命名卷，重启容器不会丢失；它们仍需要定期备份到 COS。
- 更新代码后执行：

```bash
sudo docker compose -f docker-compose.production.yml --env-file .env up -d --build
```

- 排错日志：

```bash
sudo docker compose -f docker-compose.production.yml --env-file .env logs -f
```
