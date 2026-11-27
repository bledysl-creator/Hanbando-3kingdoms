"""v4.4 길별·방향별 전투 지형: 실측 DEM(Terrarium 타일, build_terrain.py와 같은 캐시)과 하천(data/geo/rivers.json)으로
도로 A→B마다 '공격군이 B에 다가가며 싸우게 되는 땅'의 지형 비율을 잰다.

- 두 도시를 잇는 직선(실제 옛길이 아니라 추정)을 약 1km 간격으로 따라가며, 각 지점에서 좌우 ±4km 단면을 본다.
  · 계곡(valley): 양옆 능선이 둘 다 120m 이상 높고 기복이 큰 좁은 골짜기
  · 산악(mountain): 기복 표준편차 90m 이상 또는 해발 600m 이상
  · 구릉(hill): 기복 35m 이상 또는 해발 250m 이상
  · 평지(plain): 나머지
  · 강(river): 하천에서 1.2km 안 (도하·강변)
- 싸움은 목표(B) 가까이에서 벌어지므로 뒤쪽 구간에 무게를 준다: w(t) = max(0, t − 0.3)^1.5 (t = A에서 B까지 0~1).
  그래서 원주→서울(한강 평야로 내려옴)과 서울→원주(산골로 들어감)가 다르게 나온다.
- climb: 목표 앞(t 0.85~1) 평균 고도 − 중간(t 0.4~0.7) 평균 고도. 양수면 공격군이 올려 친다.
- relief: 가중 기복(0~100, 도시 산악도와 같은 눈금 std/4).

사용: python3 -I tools/geo/build_road_terrain.py /tmp/dem_cache
결과: data/geo/road_terrain.json  { "from>to": {plain, hill, mountain, valley, river, climb, relief, crossings, label} }
"""
import json, math, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_terrain import build_sampler, ROOT  # noqa: E402

KM_LAT = 1 / 111.0

def load_rivers():
    rs = json.load(open(os.path.join(ROOT, 'data/geo/rivers.json')))
    segs = []
    for r in rs:
        pts = r['pts']
        for a, b in zip(pts, pts[1:]):
            segs.append((a[0], a[1], b[0], b[1]))
    return np.array(segs)

def dist_to_rivers_km(segs, lon, lat):
    """점에서 가장 가까운 하천 선분까지 거리 (km)"""
    klon = math.cos(math.radians(lat)) / KM_LAT
    klat = 1 / KM_LAT
    ax, ay = (segs[:, 0] - lon) * klon, (segs[:, 1] - lat) * klat
    bx, by = (segs[:, 2] - lon) * klon, (segs[:, 3] - lat) * klat
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy + 1e-12
    t = np.clip(-(ax * dx + ay * dy) / L, 0, 1)
    px, py = ax + t * dx, ay + t * dy
    return float(np.min(np.sqrt(px * px + py * py)))

def crossings(segs, a, b):
    """직선 A-B가 하천 선분과 몇 번 만나나"""
    (x1, y1), (x2, y2) = a, b
    n = 0
    for (x3, y3, x4, y4) in segs:
        d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        if abs(d) < 1e-12: continue
        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d
        u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d
        if 0 <= t <= 1 and 0 <= u <= 1: n += 1
    return n

def profile(sample, segs, A, B, road_type):
    lon1, lat1, lon2, lat2 = A['lon'], A['lat'], B['lon'], B['lat']
    mlat = (lat1 + lat2) / 2
    klon = KM_LAT / math.cos(math.radians(mlat))
    dkm = math.hypot((lon2 - lon1) / klon, (lat2 - lat1) / KM_LAT)
    n = max(24, int(dkm))
    ts = np.linspace(0.02, 0.98, n)
    # 진행 방향에 수직인 단위 벡터 (km 공간)
    vx, vy = (lon2 - lon1) / klon, (lat2 - lat1) / KM_LAT
    L = math.hypot(vx, vy) or 1
    px, py = -vy / L, vx / L
    offs = np.array([-4, -3, -2, -1, 0, 1, 2, 3, 4], dtype=float)
    acc = {'plain': 0.0, 'hill': 0.0, 'mountain': 0.0, 'valley': 0.0, 'river': 0.0}
    wsum = 0.0
    stds = []
    hs = []
    for t in ts:
        lon = lon1 + (lon2 - lon1) * t
        lat = lat1 + (lat2 - lat1) * t
        lo = lon + offs * px * klon
        la = lat + offs * py * KM_LAT
        h = np.clip(sample(lo, la), -10, 2750)
        # 앞뒤 1km도 섞어 기복을 본다
        fwd = np.clip(sample(lon + np.array([-1, 1]) * vx / L * klon, lat + np.array([-1, 1]) * vy / L * KM_LAT), -10, 2750)
        c = float(h[4])
        std = float(np.std(np.concatenate([h, fwd])))
        left, right = float(np.max(h[:4])), float(np.max(h[5:]))
        enclosed = min(left, right) - c
        if enclosed >= 120 and std >= 40: k = 'valley'
        elif std >= 90 or c >= 600: k = 'mountain'
        elif std >= 35 or c >= 250: k = 'hill'
        else: k = 'plain'
        w = max(0.0, t - 0.3) ** 1.5
        acc[k] += w
        if dist_to_rivers_km(segs, lon, lat) <= 1.2: acc['river'] += w
        wsum += w
        stds.append((w, std))
        hs.append((t, c))
    out = {k: round(v / wsum, 2) for k, v in acc.items()}
    # 강은 겹쳐 잴 수 있어 따로 둔다 (평지·구릉 등과 합이 1이 아니다)
    near = np.mean([c for t, c in hs if t >= 0.85]) if any(t >= 0.85 for t, _ in hs) else hs[-1][1]
    mid = np.mean([c for t, c in hs if 0.4 <= t <= 0.7])
    out['climb'] = int(round(near - mid))
    out['relief'] = int(round(min(100, sum(w * s for w, s in stds) / wsum / 4 * 2)))
    out['crossings'] = crossings(segs, (lon1, lat1), (lon2, lat2))
    rough = out['mountain'] + out['valley']
    if road_type == 'sea': label = 'sea'
    elif out['valley'] >= 0.3: label = 'valley'
    elif rough >= 0.45: label = 'mountain'
    elif road_type == 'river' or out['river'] >= 0.35 or out['crossings'] >= 1 and out['river'] >= 0.15: label = 'river'
    elif out['plain'] >= 0.55: label = 'plain'
    else: label = 'hill'
    out['label'] = label
    return out

def main(cache):
    sample = build_sampler(cache)
    segs = load_rivers()
    cities = {c['id']: c for c in json.load(open(os.path.join(ROOT, 'data/cities.json')))}
    roads = json.load(open(os.path.join(ROOT, 'data/roads.json')))
    g = json.load(open(os.path.join(ROOT, 'data/geo/region_graph.json')))
    rc = {c['id']: c for c in g['cities']}
    out = {}
    cnt = {}
    for group, cmap in ((roads, cities), (g['roads'], rc)):
        for r in group:
            for a, b in ((r['from'], r['to']), (r['to'], r['from'])):
                p = profile(sample, segs, cmap[a], cmap[b], r['type'])
                out[f'{a}>{b}'] = p
                cnt[p['label']] = cnt.get(p['label'], 0) + 1
    json.dump(out, open(os.path.join(ROOT, 'data/geo/road_terrain.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('길 방향', len(out), cnt)
    for r in roads:
        for a, b in ((r['from'], r['to']), (r['to'], r['from'])):
            p = out[f'{a}>{b}']
            print(f"{cities[a]['name']}→{cities[b]['name']} ({r['type']}): {p}")

if __name__ == '__main__':
    main(sys.argv[1])
