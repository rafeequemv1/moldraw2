"""Generate MolDraw plugin PNG icons from the hex wordmark geometry."""
from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

TEAL = (0x2C, 0x7A, 0x7B, 255)
WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)

# Geometry copied from public/logo-mark.svg (viewBox 0 0 32 32).
HEX = [(16, 4.6), (25.5, 10.1), (25.5, 21.9), (16, 27.4), (6.5, 21.9), (6.5, 10.1)]
BONDS = [((23.95, 11.2), (23.95, 20.8)), ((16.55, 6.15), (8.2, 10.95)), ((8.2, 21.05), (16.55, 25.85))]


def png_bytes(width: int, height: int, rgba: bytes) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(rgba[y * stride : (y + 1) * stride])
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")


def mix(a, b, t: float):
    t = max(0.0, min(1.0, t))
    return tuple(int(round(a[i] * (1 - t) + b[i] * t)) for i in range(4))


def dist_seg(px, py, x0, y0, x1, y1) -> float:
    dx, dy = x1 - x0, y1 - y0
    length = dx * dx + dy * dy
    if length <= 1e-9:
        return math.hypot(px - x0, py - y0)
    t = max(0.0, min(1.0, ((px - x0) * dx + (py - y0) * dy) / length))
    return math.hypot(px - (x0 + t * dx), py - (y0 + t * dy))


def inside_hex(px, py, pts) -> bool:
    inside = False
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        if ((y0 > py) != (y1 > py)) and (px < (x1 - x0) * (py - y0) / ((y1 - y0) or 1e-9) + x0):
            inside = not inside
    return inside


def rounded_rect_alpha(px, py, size: float, radius: float) -> float:
    x = min(px, size - px)
    y = min(py, size - py)
    if x >= radius and y >= radius:
        return 1.0
    if x >= radius or y >= radius:
        return 1.0 if 0 <= px <= size and 0 <= py <= size else 0.0
    d = math.hypot(radius - x, radius - y)
    edge = 0.65
    if d <= radius - edge:
        return 1.0
    if d >= radius + edge:
        return 0.0
    return 1.0 - (d - (radius - edge)) / (2 * edge)


def stroke_alpha(px, py, x0, y0, x1, y1, width: float) -> float:
    d = dist_seg(px, py, x0, y0, x1, y1)
    half = width / 2
    if d <= half - 0.35:
        return 1.0
    if d >= half + 0.35:
        return 0.0
    return 1.0 - (d - (half - 0.35)) / 0.7


def render(size: int) -> bytes:
    scale = size / 32.0
    samples = 3 if size >= 32 else 4
    hex_pts = [(x * scale, y * scale) for x, y in HEX]
    radius = 7 * scale
    stroke = 2.2 * scale
    bond = 1.55 * scale
    pixels = bytearray(size * size * 4)
    step = 1.0 / samples
    for y in range(size):
        for x in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(samples):
                for sx in range(samples):
                    px = x + (sx + 0.5) * step
                    py = y + (sy + 0.5) * step
                    color = list(TRANSPARENT)
                    bg_a = rounded_rect_alpha(px, py, size, radius)
                    if bg_a > 0:
                        color = mix(TRANSPARENT, TEAL, bg_a)
                    ink = 0.0
                    n = len(hex_pts)
                    for i in range(n):
                        x0, y0 = hex_pts[i]
                        x1, y1 = hex_pts[(i + 1) % n]
                        ink = max(ink, stroke_alpha(px, py, x0, y0, x1, y1, stroke))
                    for (x0, y0), (x1, y1) in BONDS:
                        ink = max(
                            ink,
                            stroke_alpha(px, py, x0 * scale, y0 * scale, x1 * scale, y1 * scale, bond),
                        )
                    if ink > 0:
                        color = mix(tuple(color), WHITE, ink)
                    for i in range(4):
                        acc[i] += color[i]
            idx = (y * size + x) * 4
            denom = samples * samples
            pixels[idx : idx + 4] = bytes(int(round(v / denom)) for v in acc)
    return png_bytes(size, size, bytes(pixels))


def main() -> None:
    out = Path(__file__).resolve().parent
    for size in (16, 32, 48, 128):
        (out / f"icon{size}.png").write_bytes(render(size))
        print(f"wrote icon{size}.png")


if __name__ == "__main__":
    main()
