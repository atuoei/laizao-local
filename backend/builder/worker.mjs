import { execFile } from "node:child_process";
import { mkdir, rm, cp, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const apiBase = process.env.BUILD_API_BASE || "http://api:8000";
const workerToken = process.env.BUILD_WORKER_TOKEN || "";
const pollingMs = 3000;

if (!workerToken) throw new Error("BUILD_WORKER_TOKEN 未配置，拒绝启动构建 Worker");

function clipped(value = "") { return String(value).slice(-20000); }
async function api(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", "X-Build-Worker-Token": workerToken, ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
  return response.json();
}
async function command(file, args, cwd) {
  return run(file, args, { cwd, timeout: 120000, maxBuffer: 2 * 1024 * 1024, env: { PATH: process.env.PATH, HOME: "/tmp", npm_config_audit: "false", npm_config_fund: "false" } });
}
async function build(task) {
  const root = join("/workspace/builds", task.id);
  const source = join(root, "source");
  const target = join("/app/uploads/trials", task.work_id, `v${task.version_number}`);
  await rm(root, { recursive: true, force: true });
  await mkdir(source, { recursive: true });
  try {
    await command("unzip", ["-qq", task.source_path, "-d", source], root);
    await command("timeout", ["120", "npm", "ci", "--ignore-scripts", "--no-audit", "--fund=false"], source);
    // API 已将 build 脚本严格限定为 "vite build"。直接调用入口避免依赖 .bin 的可执行权限。
    await command("timeout", ["120", "node", "./node_modules/vite/bin/vite.js", "build"], source);
    const dist = join(source, "dist");
    const index = join(dist, "index.html");
    if (!(await stat(index)).isFile()) throw new Error("构建未生成 dist/index.html");
    const links = await command("find", [dist, "-type", "l", "-print", "-quit"], source);
    if (links.stdout.trim()) throw new Error("构建产物不能包含软链接");
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    await cp(dist, target, { recursive: true, force: true, dereference: false });
    return "构建成功：已发布 dist 静态文件。";
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
async function cycle() {
  const payload = await api("/v1/internal/builds/next", { method: "POST", body: "{}" });
  const task = payload.task;
  if (!task) return;
  try {
    const log = await build(task);
    await api(`/v1/internal/builds/${task.id}/complete`, { method: "POST", body: JSON.stringify({ status: "succeeded", log_text: log }) });
  } catch (error) {
    const output = `${error.message || error}\n${error.stdout || ""}\n${error.stderr || ""}`;
    await api(`/v1/internal/builds/${task.id}/complete`, { method: "POST", body: JSON.stringify({ status: "failed", log_text: clipped(output) }) });
  }
}
async function loop() {
  for (;;) {
    try { await cycle(); } catch (error) { console.error("build worker cycle failed", error); }
    await new Promise((resolve) => setTimeout(resolve, pollingMs));
  }
}
loop();
