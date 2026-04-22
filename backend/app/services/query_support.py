import httpx


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


def is_health_related_query(claim: str, context: str = "") -> bool:
    haystack = f"{claim} {context}".lower()
    if any(keyword in haystack for keyword in HEALTH_KEYWORDS):
        return True
    if any(keyword in haystack for keyword in NON_HEALTH_KEYWORDS):
        return False
    # Default to permissive when the heuristic is unsure, so borderline
    # clinical questions are still allowed through the real workflow.
    return True


async def fetch_claim_suggestions(query: str) -> list[str]:
    cleaned = query.strip()
    if len(cleaned) < 2:
        return []

    async with httpx.AsyncClient(timeout=4.0) as client:
        response = await client.get(
            "http://suggestqueries.google.com/complete/search",
            params={"client": "firefox", "q": cleaned},
            headers={"User-Agent": "GramWIN/1.0"},
        )
        response.raise_for_status()
        payload = response.json()

    if not isinstance(payload, list) or len(payload) < 2 or not isinstance(payload[1], list):
        return []

    seen: set[str] = set()
    suggestions: list[str] = []
    for item in payload[1]:
        if not isinstance(item, str):
            continue
        normalized = item.strip()
        lowered = normalized.lower()
        if not normalized or lowered in seen:
            continue
        seen.add(lowered)
        suggestions.append(normalized)
        if len(suggestions) >= 8:
            break
    return suggestions
