import httpx
import re


HEALTH_KEYWORDS = {
    "health",
    "healthy",
    "wellbeing",
    "wellness",
    "medical",
    "medicine",
    "doctor",
    "clinical",
    "hospital",
    "symptom",
    "disease",
    "treatment",
    "therapy",
    "drug",
    "supplement",
    "nutrition",
    "diet",
    "exercise",
    "sleep",
    "mental",
    "anxiety",
    "depression",
    "infection",
    "virus",
    "vaccine",
    "cancer",
    "blood",
    "heart",
    "brain",
    "eczema",
    "skin",
    "eczema",
    "eczema",
    "insomnia",
    "weight",
    "fat",
    "cholesterol",
    "diabetes",
    "migraine",
    "clinic",
    "research",
    "study",
    "doctor",
    "nurse",
    "medical",
}

NON_HEALTH_KEYWORDS = {
    "movie",
    "movies",
    "film",
    "tv",
    "series",
    "game",
    "games",
    "crypto",
    "bitcoin",
    "stock",
    "stocks",
    "anime",
    "football",
    "soccer",
    "basketball",
    "restaurant",
    "travel",
    "vacation",
    "song",
    "music",
    "celebrity",
    "laptop",
    "phone",
    "gpu",
    "politics",
    "election",
}

NON_ENGLISH_BLOCK_RE = re.compile(r"[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]")


def is_supported_english_query(claim: str, context: str = "") -> bool:
    probe = f"{claim} {context}".strip()
    if not probe:
        return True
    ascii_letters = len(re.findall(r"[A-Za-z]", probe))
    blocked_script_chars = len(NON_ENGLISH_BLOCK_RE.findall(probe))
    if blocked_script_chars < 2:
        return True
    return ascii_letters >= max(8, blocked_script_chars * 3)


def is_health_related_query(claim: str, context: str = "") -> bool:
    haystack = f"{claim} {context}".lower()
    if any(keyword in haystack for keyword in HEALTH_KEYWORDS):
        return True
    if any(keyword in haystack for keyword in NON_HEALTH_KEYWORDS):
        return False
    # Default to permissive when the heuristic is unsure, so borderline
    # clinical questions are still allowed through the real workflow.
    return True


async def fetch_claim_suggestions(query: str, hint: str = "", limit: int = 12) -> list[str]:
    cleaned = query.strip()
    if len(cleaned) < 2:
        return []
    if not is_supported_english_query(cleaned):
        return []

    async with httpx.AsyncClient(timeout=4.0) as client:
        response = await client.get(
            "http://suggestqueries.google.com/complete/search",
            params={"client": "firefox", "q": " ".join(part for part in [cleaned, hint.strip()] if part)},
            headers={"User-Agent": "GramWIN/1.0"},
        )
        response.raise_for_status()
        payload = response.json()

    if not isinstance(payload, list) or len(payload) < 2 or not isinstance(payload[1], list):
        return []

    seen: set[str] = set()
    suggestions: list[str] = []
    target_limit = max(1, min(limit, 20))

    for item in payload[1]:
        if not isinstance(item, str):
            continue
        normalized = item.strip()
        lowered = normalized.lower()
        if not normalized or lowered in seen:
            continue
        seen.add(lowered)
        suggestions.append(normalized)
        if len(suggestions) >= target_limit:
            break
    return suggestions
