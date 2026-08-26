import httpx

from .config import Settings


async def summarize_work(title: str, description: str, settings: Settings) -> tuple[str, str]:
    """Return a short marketplace-facing description.

    Mock mode makes the full project demoable without any paid model API key.
    """
    if settings.ai_provider.lower() != "deepseek":
        compact = " ".join(description.split())[:180]
        return f"《{title}》：{compact}", "mock"

    if not settings.deepseek_api_key:
        raise ValueError("AI_PROVIDER=deepseek 时必须配置 DEEPSEEK_API_KEY")

    payload = {
        "model": settings.deepseek_model,
        "messages": [
            {
                "role": "system",
                "content": "你是 AI 作品交易平台的编辑。用中文写一段不超过 80 字的作品卖点摘要，不夸大承诺。",
            },
            {"role": "user", "content": f"标题：{title}\n说明：{description}"},
        ],
        "temperature": 0.5,
    }
    async with httpx.AsyncClient(base_url=settings.deepseek_base_url, timeout=30) as client:
        response = await client.post(
            "/chat/completions",
            headers={"Authorization": f"Bearer {settings.deepseek_api_key}"},
            json=payload,
        )
        response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"].strip(), "deepseek"
