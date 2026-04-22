from collections.abc import Iterable

import httpx

from .. import repository
from ..settings import settings


def build_investigation_deep_link(investigation_id: str) -> str:
    scheme = settings.app_deep_link_scheme.strip() or "gramwin"
    return f"{scheme}://investigations/{investigation_id}"


def _chunked(items: list[tuple[str, dict[str, object]]], size: int) -> Iterable[list[tuple[str, dict[str, object]]]]:
    for index in range(0, len(items), size):
        yield items[index : index + size]


async def send_investigation_ready_notification(
    investigation_id: str,
    claim: str,
    summary: str,
) -> int:
    if not settings.notifications_enabled:
        return 0

    subscriptions = repository.list_push_subscriptions()
    if not subscriptions:
        return 0

    deep_link = build_investigation_deep_link(investigation_id)
    payloads = [
        (
            token,
            {
                "to": token,
                "title": "Your GramWIN analysis is ready",
                "body": (claim or summary or "Open the app to view the result.")[:140],
                "sound": "default",
                "priority": "high",
                "channelId": "investigation-ready",
                "data": {
                    "url": deep_link,
                    "investigationId": investigation_id,
                    "summary": summary[:180],
                },
            },
        )
        for token, _platform in subscriptions
    ]

    delivered = 0
    async with httpx.AsyncClient(timeout=8.0) as client:
        for batch in _chunked(payloads, 50):
            response = await client.post(
                settings.expo_push_api_url,
                headers={
                    "accept": "application/json",
                    "accept-encoding": "gzip, deflate",
                    "content-type": "application/json",
                },
                json=[message for _, message in batch],
            )
            response.raise_for_status()
            data = response.json().get("data", [])
            for (token, _message), ticket in zip(batch, data):
                if ticket.get("status") == "ok":
                    delivered += 1
                    continue
                error = (ticket.get("details") or {}).get("error") or ticket.get("message")
                if error == "DeviceNotRegistered":
                    repository.delete_push_subscription(token)

    return delivered
