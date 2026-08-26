FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
# 国内网络到 PyPI 偶发慢连接；延长超时并自动重试，不改变依赖来源。
RUN pip install --no-cache-dir --timeout 120 --retries 5 \
    --index-url https://mirrors.cloud.tencent.com/pypi/simple \
    -r requirements.txt

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
