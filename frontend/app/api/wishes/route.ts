import { env } from "cloudflare:workers";

const defaults = [
  ["seed-1", "一键把会议录音整理成行动清单", "一键把会议录音整理成行动清单", "工作效率", 328],
  ["seed-2", "为父母做一个简单的用药提醒页", "为父母做一个简单的用药提醒页", "生活健康", 216],
  ["seed-3", "把旅行照片自动排成电子手账", "把旅行照片自动排成电子手账", "图像创意", 184],
  ["seed-4", "能读懂课程表的学习计划工具", "能读懂课程表的学习计划工具", "学习研究", 147],
] as const;

async function ready() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS wishes (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    votes INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  )`).run();
  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM wishes").first<{total:number}>();
  if (!count?.total) {
    await env.DB.batch(defaults.map((w, i) => env.DB.prepare("INSERT OR IGNORE INTO wishes (id, content, title, category, votes, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(...w, Date.now() - i * 1000)));
  }
}

function localSummary(content: string) {
  const category = /图片|照片|海报|长图/.test(content) ? "图像创意" : /学习|课程|论文/.test(content) ? "学习研究" : /健康|用药|运动/.test(content) ? "生活健康" : "工作效率";
  return { title: content.replace(/[。！!？?]/g, "").slice(0, 28), category };
}

type ResponsesPayload = {
  output_text?: string;
  output?: Array<{content?: Array<{type?: string;text?: string}>}>;
};

function outputText(data: ResponsesPayload) {
  if (data.output_text) return data.output_text;
  return data.output?.flatMap(item=>item.content||[]).find(item=>item.type==="output_text")?.text;
}

async function summarize(content: string) {
  const key = (env as unknown as Record<string,string|undefined>).OPENAI_API_KEY;
  if (!key) return localSummary(content);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", { method:"POST", headers:{"content-type":"application/json",authorization:`Bearer ${key}`}, body:JSON.stringify({model:"gpt-5-mini",store:false,reasoning:{effort:"minimal"},input:`把以下愿望整理为 JSON，只返回 title（不超过18字）和 category（工作效率、生活健康、图像创意、学习研究、内容创作之一）：${content}`,text:{format:{type:"json_schema",name:"wish",strict:true,schema:{type:"object",properties:{title:{type:"string"},category:{type:"string"}},required:["title","category"],additionalProperties:false}}}}) });
    if (!response.ok) return localSummary(content);
    const data = await response.json() as ResponsesPayload;
    const text = outputText(data);
    return text ? JSON.parse(text) as {title:string;category:string} : localSummary(content);
  } catch { return localSummary(content); }
}

export async function GET() {
  await ready();
  const result = await env.DB.prepare("SELECT id, title, category, votes FROM wishes ORDER BY created_at DESC LIMIT 30").all();
  return Response.json({ wishes: result.results });
}

export async function POST(request: Request) {
  await ready();
  const body = await request.json().catch(()=>null) as {content?:string}|null;
  const content = body?.content?.trim();
  if (!content || content.length > 500) return Response.json({error:"愿望内容无效"},{status:400});
  const summary = await summarize(content);
  const wish = { id: crypto.randomUUID(), content, title: summary.title, category: summary.category, votes: 1, createdAt: Date.now() };
  await env.DB.prepare("INSERT INTO wishes (id, content, title, category, votes, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(wish.id,wish.content,wish.title,wish.category,wish.votes,wish.createdAt).run();
  return Response.json({ wish: {id:wish.id,title:wish.title,category:wish.category,votes:wish.votes} },{status:201});
}
