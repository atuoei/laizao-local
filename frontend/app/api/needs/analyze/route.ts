import { env } from "cloudflare:workers";

type NeedInput = {
  message?: string;
  answers?: string[];
  supplement?: string;
};

type NeedAnalysis = {
  assistantMessage: string;
  summaryTitle: string;
  objective: string;
  userGroup: string;
  requiredCapabilities: string[];
  deadline: string;
  match: {
    name: string;
    type: string;
    fit: number;
    reason: string;
    missing: string[];
  };
  nextAction: "use_existing" | "external_prompt" | "custom_request";
};

type ResponsesPayload = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

function outputText(data: ResponsesPayload) {
  if (data.output_text) return data.output_text;
  return data.output?.flatMap(item => item.content || []).find(item => item.type === "output_text")?.text;
}

async function ready() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS need_analyses (
    id TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    answers TEXT NOT NULL,
    supplement TEXT NOT NULL,
    analysis TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`).run();
}

function localAnalysis(input: Required<NeedInput>): NeedAnalysis {
  const combined = `${input.message} ${input.answers.join(" ")} ${input.supplement}`;
  const userGroup = input.answers.find(x => /人|团队|用户/.test(x)) || "10–20 人";
  const deadline = input.answers.find(x => /周|天|月|季度/.test(x)) || "两周内";
  const capabilities = [
    /协作|多人/.test(combined) ? "多人协作" : "单人使用",
    /权限|角色/.test(combined) ? "角色权限" : "基础权限",
    /客户|分享|确认/.test(combined) ? "客户确认" : "结果分享",
  ];
  const missing = capabilities.filter(x => ["多人协作", "角色权限", "客户确认"].includes(x));
  return {
    assistantMessage: "需求已经整理完成。现有作品可以复用基础规划能力，但团队协作与权限需要定制。",
    summaryTitle: "旅行社团队行程协作工具",
    objective: input.message.slice(0, 120),
    userGroup,
    requiredCapabilities: capabilities,
    deadline,
    match: {
      name: "松弛感旅行规划器",
      type: "网页",
      fit: 76,
      reason: "已有路线生成和客户分享能力，可复用基础规划流程。",
      missing: missing.length ? missing : ["团队成员权限", "共同编辑"],
    },
    nextAction: "custom_request",
  };
}

async function analyzeWithOpenAI(input: Required<NeedInput>): Promise<NeedAnalysis | null> {
  const key = (env as unknown as Record<string, string | undefined>).OPENAI_API_KEY;
  if (!key) return null;
  const schema = {
    type: "object",
    properties: {
      assistantMessage: { type: "string" },
      summaryTitle: { type: "string" },
      objective: { type: "string" },
      userGroup: { type: "string" },
      requiredCapabilities: { type: "array", items: { type: "string" } },
      deadline: { type: "string" },
      match: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["网页", "Skill"] },
          fit: { type: "integer", minimum: 0, maximum: 100 },
          reason: { type: "string" },
          missing: { type: "array", items: { type: "string" } },
        },
        required: ["name", "type", "fit", "reason", "missing"],
        additionalProperties: false,
      },
      nextAction: { type: "string", enum: ["use_existing", "external_prompt", "custom_request"] },
    },
    required: ["assistantMessage", "summaryTitle", "objective", "userGroup", "requiredCapabilities", "deadline", "match", "nextAction"],
    additionalProperties: false,
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-5-mini",
      store: false,
      reasoning: { effort: "minimal" },
      max_output_tokens: 900,
      instructions: "你是来造客服，只负责整理需求、匹配已有网页或 Skill、指出缺口并推荐下一步。不得替用户发布、付款、生成代码或声称已经成交。用简洁中文输出。已有作品中，与旅行需求最接近的是“松弛感旅行规划器”。",
      input: JSON.stringify(input),
      text: { format: { type: "json_schema", name: "need_analysis", strict: true, schema } },
    }),
  });
  if (!response.ok) return null;
  const data = await response.json() as ResponsesPayload;
  const text = outputText(data);
  return text ? JSON.parse(text) as NeedAnalysis : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as NeedInput | null;
  const message = body?.message?.trim() || "";
  if (!message || message.length > 1000) return Response.json({ error: "需求内容无效" }, { status: 400 });
  const input = {
    message,
    answers: (body?.answers || []).filter(Boolean).slice(0, 12),
    supplement: (body?.supplement || "").trim().slice(0, 1000),
  };
  await ready();
  let source = "local";
  let analysis: NeedAnalysis;
  try {
    const openAIAnalysis = await analyzeWithOpenAI(input);
    analysis = openAIAnalysis || localAnalysis(input);
    if (openAIAnalysis) source = "openai";
  } catch {
    source = "local";
    analysis = localAnalysis(input);
  }
  await env.DB.prepare("INSERT INTO need_analyses (id, message, answers, supplement, analysis, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), input.message, JSON.stringify(input.answers), input.supplement, JSON.stringify(analysis), source, Date.now()).run();
  return Response.json({ analysis, source });
}
