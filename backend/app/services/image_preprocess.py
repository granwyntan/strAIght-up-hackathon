from __future__ import annotations

import io

from PIL import Image, ImageOps


DEFAULT_MAX_DIMENSION = 1024
DEFAULT_JPEG_QUALITY = 72


def optimize_image_for_openai(
    image_bytes: bytes,
    *,
    max_dimension: int = DEFAULT_MAX_DIMENSION,
    jpeg_quality: int = DEFAULT_JPEG_QUALITY,
) -> tuple[bytes, str]:
    """
    Resize/compress images before vision requests to reduce payload size and image token cost.
    Returns (optimized_bytes, content_type).
    """
    if max_dimension < 256:
        max_dimension = 256
    if max_dimension > 4096:
        max_dimension = 4096
    if jpeg_quality < 45:
        jpeg_quality = 45
    if jpeg_quality > 90:
        jpeg_quality = 90

    with Image.open(io.BytesIO(image_bytes)) as source:
        image = ImageOps.exif_transpose(source)
        if image.mode not in {"RGB", "L"}:
            image = image.convert("RGB")
        elif image.mode == "L":
            image = image.convert("RGB")

        width, height = image.size
        longest = max(width, height)
        if longest > max_dimension:
            scale = max_dimension / float(longest)
            resized = (max(1, int(round(width * scale))), max(1, int(round(height * scale))))
            image = image.resize(resized, Image.Resampling.LANCZOS)

        output = io.BytesIO()
        image.save(
            output,
            format="JPEG",
            quality=jpeg_quality,
            optimize=True,
            progressive=True,
        )

    return output.getvalue(), "image/jpeg"
