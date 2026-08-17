"""Generate PWA icons (network-hub logo) as PNGs into frontend/public.

Run:  python scripts/generate_icons.py
Produces: pwa-192x192.png, pwa-512x512.png, pwa-maskable-512x512.png,
          apple-touch-icon.png (180), favicon-64.png
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public"
OUT.mkdir(parents=True, exist_ok=True)

# Palette (matches BrandLogo.jsx)
BG_TOP = (11, 18, 48)        # #0b1230
BG_MID = (20, 26, 69)        # #141a45
BG_BOT = (35, 42, 110)       # #232a6e
RING_A = (103, 232, 249)     # #67e8f9
RING_B = (129, 140, 248)     # #818cf8
RING_C = (192, 132, 252)     # #c084fc
NODE_A = (165, 243, 252)     # #a5f3fc
NODE_B = (129, 140, 248)     # #818cf8
CORE_EDGE = (99, 102, 241)   # #6366f1
CORE_MID = (199, 210, 254)   # #c7d2fe
WHITE = (255, 255, 255)
DARK_STROKE = (11, 18, 48)


def lerp(c1, c2, t):
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


def gradient_bg(size, radius):
    """Rounded-rect background with a diagonal 3-stop gradient."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            if t < 0.55:
                color = lerp(BG_TOP, BG_MID, t / 0.55)
            else:
                color = lerp(BG_MID, BG_BOT, (t - 0.55) / 0.45)
            px[x, y] = color + (255,)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size, size], radius=radius, fill=255)
    img.putalpha(mask)
    return img


def draw_logo(size, maskable=False):
    """Render the network-hub mark. maskable keeps art inside the safe zone."""
    radius = int(size * (0.5 if maskable else 0.297))
    img = gradient_bg(size, radius)
    draw = ImageDraw.Draw(img)

    cx = cy = size / 2
    # Scale factor: maskable icons need the art ~20% smaller (safe zone).
    s = (size / 64.0) * (0.78 if maskable else 1.0)

    def pt(x, y):
        return (cx + (x - 32) * s, cy + (y - 32) * s)

    # Orbit ring (dashed circle)
    r = 17.5 * s
    dash_deg = 28
    gap_deg = 32
    angle = 0
    ring_w = max(2, int(2 * s))
    while angle < 360:
        draw.arc([cx - r, cy - r, cx + r, cy + r], start=angle,
                 end=min(angle + dash_deg, 360), fill=RING_B, width=ring_w)
        angle += dash_deg + gap_deg

    # Node positions (same as SVG: top, bottom-right, bottom-left)
    nodes = [(32, 14.5), (47.2, 40.8), (16.8, 40.8)]

    # Spokes
    spoke_w = max(2, int(2.2 * s))
    for nx, ny in nodes:
        draw.line([pt(32, 32), pt(nx, ny)], fill=RING_B + (140,), width=spoke_w)

    # Nodes
    node_r = 4.6 * s
    for nx, ny in nodes:
        x, y = pt(nx, ny)
        draw.ellipse([x - node_r, y - node_r, x + node_r, y + node_r],
                     fill=NODE_A, outline=DARK_STROKE, width=max(1, int(1.6 * s)))

    # Core halo
    halo_r = 11.5 * s
    halo = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(halo).ellipse([cx - halo_r, cy - halo_r, cx + halo_r, cy + halo_r],
                                 fill=CORE_MID + (72,))
    img = Image.alpha_composite(img, halo)
    draw = ImageDraw.Draw(img)

    # Core (radial-ish: layered circles)
    core_r = 8.4 * s
    draw.ellipse([cx - core_r, cy - core_r, cx + core_r, cy + core_r],
                 fill=CORE_EDGE, outline=(255, 255, 255, 166), width=max(1, int(1.4 * s)))
    mid_r = core_r * 0.72
    draw.ellipse([cx - mid_r, cy - mid_r, cx + mid_r, cy + mid_r], fill=CORE_MID)
    hi_r = core_r * 0.42
    hx, hy = cx - core_r * 0.3, cy - core_r * 0.35
    draw.ellipse([hx - hi_r, hy - hi_r, hx + hi_r, hy + hi_r], fill=WHITE)

    return img


def main():
    specs = [
        ("pwa-192x192.png", 192, False),
        ("pwa-512x512.png", 512, False),
        ("pwa-maskable-512x512.png", 512, True),
        ("apple-touch-icon.png", 180, False),
        ("favicon-64.png", 64, False),
    ]
    for name, size, maskable in specs:
        icon = draw_logo(size, maskable=maskable)
        icon.save(OUT / name)
        print("wrote", OUT / name)


if __name__ == "__main__":
    main()
