#!/usr/bin/env python3
"""Sestaví docs/index.html ze šablony src/manifest.template.html.

Do šablony vloží:
  {{BLOB_PATHS}}   – křivky otisku (src/assets/otisk-paths.txt, jedna <path> na řádek)
  {{HERO}}         – úvodní fotka jako data URI (src/assets/hero.jpg)
  {{F_*}}          – čtyři řezy Agrandiru jako data URI (src/fonts/*.woff)

Výsledek je jeden soubor bez externích závislostí – jde poslat mailem,
otevřít z disku nebo hostovat kdekoli (GitHub Pages bere složku docs/).

Použití:  python3 build.py
Volitelně: python3 build.py --hero cesta/k/nove-fotce.jpg   (zmenší na 2000 px a zkomprimuje)
"""
import argparse, base64, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
OUT = os.path.join(ROOT, 'docs', 'index.html')


def data_uri(path, mime):
    with open(path, 'rb') as f:
        return 'data:' + mime + ';base64,' + base64.b64encode(f.read()).decode()


def prepare_hero(source):
    """Zmenší a zkomprimuje fotku do src/assets/hero.jpg (vyžaduje Pillow)."""
    from PIL import Image
    im = Image.open(source).convert('RGB')
    if im.width > 2000:
        im = im.resize((2000, round(2000 * im.height / im.width)), Image.LANCZOS)
    im.save(os.path.join(SRC, 'assets', 'hero.jpg'), 'JPEG', quality=78, optimize=True, progressive=True)
    print('hero.jpg:', im.size)


def build():
    with open(os.path.join(SRC, 'manifest.template.html'), encoding='utf-8') as f:
        tpl = f.read()

    with open(os.path.join(SRC, 'assets', 'otisk-paths.txt'), encoding='utf-8') as f:
        paths = [l.strip() for l in f if l.strip()]
    blob = ''.join(f'<path d="{d}"/>' for d in paths)

    fonts = {
        '{{F_GRANDHEAVY}}': 'Agrandir-GrandHeavy.woff',
        '{{F_REGULAR}}': 'Agrandir-Regular.woff',
        '{{F_NARROWBLACK}}': 'Agrandir-NarrowBlack.woff',
        '{{F_GRAND}}': 'Agrandir-Grand.woff',
    }
    body = tpl.replace('{{BLOB_PATHS}}', blob)
    body = body.replace('{{HERO}}', data_uri(os.path.join(SRC, 'assets', 'hero.jpg'), 'image/jpeg'))
    for key, name in fonts.items():
        body = body.replace(key, data_uri(os.path.join(SRC, 'fonts', name), 'font/woff'))
    if '{{' in body:
        sys.exit('V šabloně zůstal nenahrazený placeholder: ' + re.search(r'\{\{[^}]+\}\}', body).group(0))

    # šablona začíná <title> a <meta>, ty patří do <head>; zbytek je tělo stránky
    head = re.match(r'(<title>.*?</title>\s*<meta[^>]*>\s*)', body, re.S).group(1)
    rest = body[len(head):]
    html = ('<!doctype html>\n<html lang="cs">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + head + '</head>\n<body>\n' + rest + '\n</body>\n</html>\n')

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(html)
    print('docs/index.html:', f'{os.path.getsize(OUT) / 1024:.0f} kB')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--hero', help='nová úvodní fotka (zmenší se a nahradí src/assets/hero.jpg)')
    a = ap.parse_args()
    if a.hero:
        prepare_hero(a.hero)
    build()
