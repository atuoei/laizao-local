# 来造受控全栈作品模板（管理员试运行）

此模板适用于 React/Vite 前端与 FastAPI 后端组成的作品。上传 ZIP 前，目录必须是：

```text
my-work.zip
├── laizao.app.json
├── frontend/
│   ├── package.json
│   ├── package-lock.json
│   └── src/
└── backend/
    ├── requirements.txt
    └── app/main.py
```

平台当前只接受：

- `frontend/package.json` 的 `scripts.build` 严格为 `vite build`；
- `backend/app/main.py` 暴露 FastAPI 变量 `app`；
- 后端提供 `GET /health` 并返回 2xx；
- `laizao.app.json` 使用同目录提供的固定内容。

不要上传 `Dockerfile`、`docker-compose.yml`、`.env`、`node_modules` 或任何密钥。平台将来会为每个通过审核的作品生成受限容器、反向代理和环境变量；ZIP 本身不拥有服务器权限。

当前阶段只完成**静态准入检查**，通过结果不表示作品已构建或已启动。
