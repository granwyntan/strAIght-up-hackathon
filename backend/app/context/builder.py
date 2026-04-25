from ..models import InvestigationCreateRequest


def build_context(request: InvestigationCreateRequest) -> dict[str, str | list[str]]:
    return {
        "claim": request.claim,
        "context": request.context,
        "profileContext": request.profileContext,
        "sourceUrls": request.sourceUrls,
        "desiredDepth": request.desiredDepth,
        "mode": request.mode,
    }
