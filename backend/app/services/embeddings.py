import math

import httpx

from app.core.config import get_settings


class EmbeddingError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def require_embedding_key() -> str:
    settings = get_settings()
    provider = settings.embedding_provider
    key = getattr(settings, f"{provider}_api_key").get_secret_value()
    if not key:
        raise EmbeddingError(f"{provider}_not_configured", f"Chưa cấu hình {provider.upper()}_API_KEY trên backend.")
    return key


def embed_batch(client: httpx.Client, texts: list[str], title: str, *, query: bool = False) -> tuple[list[list[float]], int | None]:
    settings = get_settings()
    provider = settings.embedding_provider
    key = require_embedding_key()
    if provider == "cohere":
        url = "https://api.cohere.com/v2/embed"
        headers = {"Authorization": f"Bearer {key}"}
        payload = {"model": settings.cohere_embedding_model,
                   "inputs": [{"content": [{"type": "text", "text": value}]} for value in texts],
                   "input_type": "search_query" if query else "search_document", "embedding_types": ["float"], "output_dimension": 768}
    else:
        model = f"models/{settings.gemini_embedding_model}"
        url = f"https://generativelanguage.googleapis.com/v1beta/{model}:batchEmbedContents"
        headers = {"x-goog-api-key": key}
        payload = {"requests": [{"model": model, "content": {"parts": [{"text": value}]},
                    "taskType": "RETRIEVAL_QUERY" if query else "RETRIEVAL_DOCUMENT",
                    **({} if query else {"title": title}), "outputDimensionality": 768} for value in texts]}
    try:
        response = client.post(url, headers=headers, json=payload)
    except httpx.RequestError as exc:
        raise EmbeddingError(f"{provider}_connection", f"Không kết nối được {provider}. Vui lòng thử xử lý lại sau.") from exc
    if response.status_code != 200:
        raise EmbeddingError(f"{provider}_http_{response.status_code}",
                             f"{provider} từ chối yêu cầu. Kiểm tra API key, model và hạn mức trước khi thử lại.")
    try:
        data = response.json()
        embeddings = data["embeddings"]["float"] if provider == "cohere" else data["embeddings"]
        if not isinstance(embeddings, list) or len(embeddings) != len(texts):
            raise ValueError("Unexpected embedding count")
        vectors = []
        for item in embeddings:
            values = item if provider == "cohere" else item["values"]
            if not isinstance(values, list) or len(values) != 768 or any(
                type(value) not in (int, float) or not math.isfinite(value) for value in values
            ):
                raise ValueError("Invalid embedding values")
            norm = math.sqrt(sum(value * value for value in values))
            if not math.isfinite(norm) or norm == 0:
                raise ValueError("Invalid embedding norm")
            vectors.append([value / norm for value in values])
        if provider == "cohere":
            usage = (data.get("meta") or {}).get("billed_units") or {}
            tokens = usage.get("input_tokens")
        else:
            usage = data.get("usageMetadata") or {}
            tokens = usage.get("totalTokenCount")
        if tokens is not None and (type(tokens) is not int or tokens < 0):
            tokens = None
    except (ValueError, KeyError, TypeError, AttributeError, OverflowError) as exc:
        raise EmbeddingError(f"{provider}_invalid_response", f"{provider} trả về embedding không hợp lệ.") from exc
    return vectors, tokens
