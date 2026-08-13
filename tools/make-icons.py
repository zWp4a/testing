#!/usr/bin/env python3
"""Genera los PNG del icono sin dependencias externas (zlib + struct).

Dibuja una casita blanca sobre fondo azul, con supersampling 4x para que
los bordes queden suaves. Uso: python3 tools/make-icons.py
"""

import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")

BLUE_TOP = (42, 120, 214)
BLUE_BOTTOM = (24, 79, 149)
WHITE = (255, 255, 255)
SS = 4  # factor de supersampling


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def rounded_rect(x, y, w, h, r, px, py):
    """¿El punto (px, py) está dentro del rectángulo redondeado?"""
    if px < x or py < y or px > x + w or py > y + h:
        return False
    cx = min(max(px, x + r), x + w - r)
    cy = min(max(py, y + r), y + h - r)
    dx, dy = px - cx, py - cy
    return dx * dx + dy * dy <= r * r or (x + r <= px <= x + w - r) or (y + r <= py <= y + h - r)


def point_in_poly(px, py, poly):
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > py) != (y2 > py):
            xint = (x2 - x1) * (py - y1) / (y2 - y1) + x1
            if px < xint:
                inside = not inside
    return inside


def draw(size, maskable=False):
    """Devuelve un buffer RGBA (bytes) de size x size."""
    s = size * SS
    # Margen extra en los maskable: Android recorta los bordes.
    pad = s * 0.18 if maskable else s * 0.0
    box_x, box_y = pad, pad
    box_w = box_h = s - pad * 2
    radius = box_w * (0.30 if not maskable else 0.32)

    # Casa centrada dentro de la caja.
    cx = box_x + box_w / 2
    top = box_y + box_h * 0.24
    roof_half = box_w * 0.30
    eaves = box_y + box_h * 0.47
    body_left = cx - box_w * 0.205
    body_right = cx + box_w * 0.205
    body_bottom = box_y + box_h * 0.755

    roof = [(cx, top), (cx + roof_half, eaves), (cx - roof_half, eaves)]
    body = [(body_left, eaves - box_h * 0.01), (body_right, eaves - box_h * 0.01),
            (body_right, body_bottom), (body_left, body_bottom)]

    # Corazón simplificado (dos círculos + triángulo) como "puerta".
    heart_cx = cx
    heart_cy = box_y + box_h * 0.60
    heart_r = box_w * 0.052

    rows = []
    for py in range(s):
        row = bytearray()
        yf = py + 0.5
        for px in range(s):
            xf = px + 0.5
            if not rounded_rect(box_x, box_y, box_w, box_h, radius, xf, yf):
                row += bytes((0, 0, 0, 0))
                continue
            t = (yf - box_y) / box_h
            bg = lerp(BLUE_TOP, BLUE_BOTTOM, max(0.0, min(1.0, t)))

            in_house = point_in_poly(xf, yf, roof) or point_in_poly(xf, yf, body)
            if in_house:
                # Recorte del corazón dentro de la casa.
                dx1 = xf - (heart_cx - heart_r * 0.82)
                dx2 = xf - (heart_cx + heart_r * 0.82)
                dy = yf - heart_cy
                lobes = (dx1 * dx1 + dy * dy <= heart_r * heart_r) or (dx2 * dx2 + dy * dy <= heart_r * heart_r)
                tri = point_in_poly(xf, yf, [
                    (heart_cx - heart_r * 1.62, heart_cy),
                    (heart_cx + heart_r * 1.62, heart_cy),
                    (heart_cx, heart_cy + heart_r * 2.0),
                ])
                if lobes or tri:
                    row += bytes((*bg, 255))
                else:
                    row += bytes((*WHITE, 255))
            else:
                row += bytes((*bg, 255))
        rows.append(bytes(row))

    # Downsample promediando bloques de SS x SS.
    out = bytearray()
    for y in range(size):
        out.append(0)  # filtro PNG "none"
        for x in range(size):
            r = g = b = a = 0
            for dy in range(SS):
                srow = rows[y * SS + dy]
                for dx in range(SS):
                    i = (x * SS + dx) * 4
                    r += srow[i]
                    g += srow[i + 1]
                    b += srow[i + 2]
                    a += srow[i + 3]
            n = SS * SS
            out += bytes((r // n, g // n, b // n, a // n))
    return bytes(out)


def write_png(path, size, raw):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", header)
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print(f"  {os.path.basename(path)}  {len(png) // 1024} KB")


def main():
    os.makedirs(OUT, exist_ok=True)
    print("Generando iconos…")
    for size in (180, 192, 512):
        write_png(os.path.join(OUT, f"icon-{size}.png"), size, draw(size))
    write_png(os.path.join(OUT, "icon-maskable-512.png"), 512, draw(512, maskable=True))


if __name__ == "__main__":
    main()
