import asyncio
from collections.abc import Awaitable, Callable, Iterable
from typing import TypeVar


T = TypeVar("T")
R = TypeVar("R")


async def gather_limited(
    items: Iterable[T],
    worker: Callable[[T], Awaitable[R]],
    concurrency: int,
) -> list[R]:
    semaphore = asyncio.Semaphore(max(1, concurrency))

    async def run(item: T) -> R:
        async with semaphore:
            return await worker(item)

    return list(await asyncio.gather(*(run(item) for item in items)))


async def retry_async(
    fn: Callable[[], Awaitable[R]],
    attempts: int = 2,
    base_delay_seconds: float = 0.35,
) -> R:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            return await fn()
        except Exception as exc:  # pragma: no cover - intentionally broad for API fallbacks
            last_error = exc
            if attempt >= attempts - 1:
                break
            await asyncio.sleep(base_delay_seconds * (attempt + 1))
    if last_error is None:
        raise RuntimeError("Retry failed without capturing an error.")
    raise last_error
