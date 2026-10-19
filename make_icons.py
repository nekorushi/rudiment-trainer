"""Regenerate the PNG icons (needs Pillow): python3 make_icons.py"""
from PIL import Image, ImageDraw

BG = (13, 15, 19)
MINT = (126, 224, 176)
ORANGE = (255, 176, 74)
BLUE = (82, 199, 242)
S = 1024  # draw large, then downsample for smooth edges


def draw(scale_art=1.0, rounded=True):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0) if rounded else BG + (255,))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle((0, 0, S, S), radius=int(S * 0.22), fill=BG + (255,))
    c = S / 2

    def p(x, y):  # coordinates are on a 512 grid, centred, optionally shrunk
        return (c + (x - 256) * 2 * scale_art, c + (y - 256) * 2 * scale_art)

    def line(a, b, color, w):
        d.line((*p(*a), *p(*b)), fill=color, width=int(w * 2 * scale_art))
        for x, y in (a, b):
            cx, cy = p(x, y)
            r = w * scale_art
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)

    r = 140 * 2 * scale_art
    d.ellipse((c - r, c - r, c + r, c + r), outline=MINT, width=int(22 * 2 * scale_art))
    line((102, 410), (384, 128), ORANGE, 13)
    line((410, 410), (128, 128), BLUE, 13)
    return img


def save(img, name, size):
    img.resize((size, size), Image.LANCZOS).save(f"icons/{name}")


save(draw(), "icon-512.png", 512)
save(draw(), "icon-192.png", 192)
save(draw(scale_art=0.72, rounded=False), "icon-maskable-512.png", 512)
save(draw(scale_art=0.9, rounded=False), "apple-touch-icon.png", 180)
print("icons written")
