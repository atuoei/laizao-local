import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Laizao product homepage", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /来造 Next/);
  assert.match(html, /让好作品被使用/);
  assert.match(html, /作品广场/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("transaction client sends an idempotency key", async () => {
  const api = await readFile(new URL("../app/vibe-api.ts", import.meta.url), "utf8");
  assert.match(api, /Idempotency-Key/);
  assert.match(api, /crypto\.randomUUID/);
});
