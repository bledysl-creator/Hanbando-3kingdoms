"""실측 고도(Terrarium DEM 타일, AWS Open Data 'Terrain Tiles' — SRTM·GMTED 등 공개 자료 합성)로
1) 시·군 평균 고도를 data/geo/regions.json 의 elev 로 갱신하고
2) 지형 지도용 음영 기복도 public/terrain.webp 를 만든다 (v1.9).

사용: python3 -I tools/geo/build_terrain.py <타일 캐시 폴더>
타일: https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
고도(m) = R*256 + G + B/256 - 32768
"""
import io, json, math, os, sys, urllib.request
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
Z = 8
LON0, LAT0, KX, KY = 124.0, 43.0, 78.8, 100.0  # src/map/geo.ts 와 같은 투영
W, H = 560, 1000
SCALE = 2  # 출력 해상도 배수

def tile_xy(lon, lat):
    n = 2 ** Z
    x = (np.asarray(lon, dtype=float) + 180) / 360 * n
    y = (1 - np.arcsinh(np.tan(np.radians(np.asarray(lat, dtype=float)))) / np.pi) / 2 * n
    return x, y

def load_tile(cache, x, y):
    p = os.path.join(cache, f'{Z}_{x}_{y}.png')
    if not os.path.exists(p):
        url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png'
        with urllib.request.urlopen(url, timeout=30) as r:
            open(p, 'wb').write(r.read())
    a = np.asarray(Image.open(p).convert('RGB'), dtype=np.float64)
    return a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768

def build_sampler(cache):
    x0, y0 = tile_xy(LON0 - 0.1, LAT0 + 0.1)
    x1, y1 = tile_xy(LON0 + W / KX + 0.1, LAT0 - H / KY - 0.1)
    tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
    print('tiles', (tx1 - tx0 + 1) * (ty1 - ty0 + 1))
    mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256))
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = load_tile(cache, tx, ty)
    def sample(lon, lat):
        fx, fy = tile_xy(lon, lat)
        px = np.clip(((fx - tx0) * 256).astype(int), 0, mosaic.shape[1] - 1)
        py = np.clip(((fy - ty0) * 256).astype(int), 0, mosaic.shape[0] - 1)
        return mosaic[py, px]
    return sample

def ramp(h):
    stops = [(0, (86, 120, 70)), (100, (120, 140, 80)), (300, (160, 150, 90)), (700, (150, 115, 75)), (1200, (120, 95, 70)), (2000, (210, 205, 200)), (2800, (245, 245, 245))]
    out = np.zeros(h.shape + (3,))
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        m = (h >= a) & (h < b) if b != stops[-1][0] else (h >= a)
        t = np.clip((h - a) / (b - a), 0, 1)[..., None]
        out[m] = (np.array(ca) * (1 - t) + np.array(cb) * t)[m]
    return out

def main(cache):
    os.makedirs(cache, exist_ok=True)
    sample = build_sampler(cache)
    # 1) 래스터
    xs = (np.arange(W * SCALE) + 0.5) / SCALE
    ys = (np.arange(H * SCALE) + 0.5) / SCALE
    X, Y = np.meshgrid(xs, ys)
    lon, lat = LON0 + X / KX, LAT0 - Y / KY
    h = sample(lon, lat)
    regions = json.load(open(os.path.join(ROOT, 'data/geo/regions.json')))
    # 육지 마스크: 시·군 경계 폴리곤 (북중 국경 밖은 그리지 않음)
    mask = Image.new('L', (W * SCALE, H * SCALE), 0)
    d = ImageDraw.Draw(mask)
    for r in regions:
        for poly in r['rings']:
            ring = poly[0] if isinstance(poly[0][0], list) else poly
            d.polygon([((x - LON0) * KX * SCALE, (LAT0 - y) * KY * SCALE) for x, y in ring], fill=255)
    hl = np.clip(h, 0, 2750)  # 백두산(2,744m)보다 높은 값은 타일 잡음
    gy, gx = np.gradient(hl)
    cell = 1000 / KY / SCALE * 111  # 대략 m/px
    slope = np.arctan(np.hypot(gx, gy) / (cell * 1000) * 3)
    aspect = np.arctan2(-gx, gy)
    az, alt = math.radians(315), math.radians(45)
    shade = np.clip(np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect), 0, 1)
    rgb = ramp(hl) * (0.45 + 0.75 * shade[..., None])
    img = np.dstack([np.clip(rgb, 0, 255), np.asarray(mask)]).astype(np.uint8)
    os.makedirs(os.path.join(ROOT, 'public'), exist_ok=True)
    Image.fromarray(img, 'RGBA').save(os.path.join(ROOT, 'public/terrain.webp'), quality=78, method=6)
    # 2) 시·군 평균 고도: 폴리곤 안 격자 표본의 평균
    for r in regions:
        m = Image.new('L', (W * SCALE, H * SCALE), 0)
        dd = ImageDraw.Draw(m)
        for poly in r['rings']:
            ring = poly[0] if isinstance(poly[0][0], list) else poly
            dd.polygon([((x - LON0) * KX * SCALE, (LAT0 - y) * KY * SCALE) for x, y in ring], fill=255)
        sel = np.asarray(m) > 0
        vals = hl[sel] if sel.any() else np.array([float(sample(np.array(r['lon']), np.array(r['lat'])))])
        r['elev'] = int(round(float(vals.mean())))
        r['elevMax'] = int(round(float(vals.max())))
    json.dump(regions, open(os.path.join(ROOT, 'data/geo/regions.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('regions', len(regions), 'max elev', max(r['elevMax'] for r in regions))

if __name__ == '__main__':
    main(sys.argv[1])
