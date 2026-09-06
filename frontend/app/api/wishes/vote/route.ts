import { env } from "cloudflare:workers";
import { dataActor, identifiedJson } from "../../data-identity";

export async function POST(request: Request) {
  const actor = dataActor(request);
  const body = await request.json().catch(()=>null) as {id?:string}|null;
  if (!body?.id) return Response.json({error:"缺少愿望"},{status:400});
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS wish_votes (
    id TEXT PRIMARY KEY, wish_id TEXT NOT NULL, actor_id TEXT NOT NULL, created_at INTEGER NOT NULL,
    FOREIGN KEY (wish_id) REFERENCES wishes(id), UNIQUE(wish_id, actor_id)
  )`).run();
  const inserted = await env.DB.prepare("INSERT OR IGNORE INTO wish_votes (id, wish_id, actor_id, created_at) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(),body.id,actor.id,Date.now()).run();
  if ((inserted.meta?.changes || 0) > 0) await env.DB.prepare("UPDATE wishes SET votes = votes + 1 WHERE id = ?").bind(body.id).run();
  const row = await env.DB.prepare("SELECT votes FROM wishes WHERE id = ?").bind(body.id).first<{votes:number}>();
  return row ? identifiedJson({...row,already_voted:(inserted.meta?.changes||0)===0},actor) : identifiedJson({error:"愿望不存在"},actor,{status:404});
}
