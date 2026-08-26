import { env } from "cloudflare:workers";

export async function POST(request: Request) {
  const body = await request.json().catch(()=>null) as {id?:string}|null;
  if (!body?.id) return Response.json({error:"缺少愿望"},{status:400});
  await env.DB.prepare("UPDATE wishes SET votes = votes + 1 WHERE id = ?").bind(body.id).run();
  const row = await env.DB.prepare("SELECT votes FROM wishes WHERE id = ?").bind(body.id).first<{votes:number}>();
  return row ? Response.json(row) : Response.json({error:"愿望不存在"},{status:404});
}
