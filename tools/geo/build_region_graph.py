"""군현 지도(v3.2): 시·군 345곳을 각각 게임 도시로 만든다 → data/geo/region_graph.json
- 이웃: 시·군 경계를 격자에 그려 맞닿은 칸(거리 3칸 이내)으로 판단 (남북 경계 자료가 달라 꼭짓점이 안 맞아도 연결됨)
- 해안: 경계 바깥 칸이 바다(실측 고도 ≤ 0)인 비율
- 지형: 고도·해안·하천(rivers.json 선이 지나감)으로 산악/해안/강변/평야
- 인구·생산: 관할 도시(24곳)의 값을 면적·고도·시/군 여부로 나눠 줌 (게임 수치, 실제 통계 아님)
- 길: 맞닿은 시·군끼리. 둘 다 고지대이거나 고도 차가 크면 고개, 경계에 강이 지나면 도하. 이웃이 없는 섬은 가장 가까운 해안 시·군과 해로.
사용: python3 -I tools/geo/build_region_graph.py <DEM 타일 캐시 폴더>
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_terrain import build_sampler, LON0, LAT0, KX, KY, W, H  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
S = 2  # 격자 배율

def px(lon, lat):
    return ((lon - LON0) * KX * S, (LAT0 - lat) * KY * S)

def main(cache):
    regions = json.load(open(os.path.join(ROOT, 'data/geo/regions.json')))
    cities = {c['id']: c for c in json.load(open(os.path.join(ROOT, 'data/cities.json')))}
    landmarks = json.load(open(os.path.join(ROOT, 'data/landmarks.json')))
    rivers = json.load(open(os.path.join(ROOT, 'data/geo/rivers.json')))
    n = len(regions)
    lab = Image.new('I', (W * S, H * S), 0)
    d = ImageDraw.Draw(lab)
    for i, r in enumerate(regions, start=1):
        for ring in r['rings']:
            d.polygon([px(x, y) for x, y in ring], fill=i)
    L = np.asarray(lab, dtype=np.int32)
    # 하천 격자
    riv = Image.new('L', (W * S, H * S), 0)
    dr = ImageDraw.Draw(riv)
    for rv in rivers:
        dr.line([px(x, y) for x, y in rv['pts']], fill=255, width=3)
    R = np.asarray(riv) > 0
    # 바다: 격자 칸의 실측 고도 ≤ 0 이고 시·군 밖
    sample = build_sampler(cache)
    ys, xs = np.mgrid[0:H * S, 0:W * S]
    elev = sample(LON0 + (xs + 0.5) / S / KX, LAT0 - (ys + 0.5) / S / KY)
    SEA = (L == 0) & (elev <= 0)
    # 이웃·경계 길이·해안 길이
    border = {}
    river_border = {}
    coast = np.zeros(n + 1); perim = np.zeros(n + 1)
    for dy, dx in [(0, 1), (1, 0), (0, 2), (2, 0), (0, 3), (3, 0)]:
        a = L[:H * S - dy, :W * S - dx]; b = L[dy:, dx:]
        rv = R[:H * S - dy, :W * S - dx] | R[dy:, dx:]
        m = (a != b) & (a > 0) & (b > 0)
        for x, y, rr in zip(a[m], b[m], rv[m]):
            k = (min(x, y), max(x, y))
            border[k] = border.get(k, 0) + 1
            if rr: river_border[k] = river_border.get(k, 0) + 1
        if dy + dx == 1:
            sa = SEA[:H * S - dy, :W * S - dx]; sb = SEA[dy:, dx:]
            for arr, nb, other in ((a, b, sb), (b, a, sa)):
                mm = (arr > 0) & (arr != nb)  # 경계 칸만
                np.add.at(perim, arr[mm], 1)
                np.add.at(coast, arr[mm & other], 1)
    # 면적·도시 좌표가 든 시·군
    area = np.bincount(L.ravel(), minlength=n + 1)
    def region_at(lon, lat):
        x, y = px(lon, lat); x = int(min(max(x, 0), W * S - 1)); y = int(min(max(y, 0), H * S - 1))
        v = int(L[y, x])
        if v: return v
        return 1 + min(range(n), key=lambda i: (regions[i]['lon'] - lon) ** 2 + (regions[i]['lat'] - lat) ** 2)
    seat = {cid: region_at(c['lon'], c['lat']) for cid, c in cities.items()}
    lm_region = {l['id']: regions[region_at(l['lon'], l['lat']) - 1]['id'] for l in landmarks}
    # 시·군 도시 데이터
    out_c = []
    by_parent = {}
    for i, r in enumerate(regions, start=1):
        by_parent.setdefault(r['parent'], []).append(i)
    weights = {}
    for i, r in enumerate(regions, start=1):
        e = r.get('elev', 0)
        w = math.sqrt(max(area[i], 1)) * (1.6 if e < 100 else 1.1 if e < 300 else 0.6)
        if r['name'].endswith('특별시') or r['name'].endswith('광역시'): w *= 3
        elif r['name'].endswith('시'): w *= 1.5
        if i == seat.get(r['parent']): w *= 2.5
        weights[i] = w
    names = {}
    for r in regions: names[r['name']] = names.get(r['name'], 0) + 1
    for i, r in enumerate(regions, start=1):
        p = cities[r['parent']]
        sib = by_parent[r['parent']]
        share = weights[i] / sum(weights[j] for j in sib)
        e = r.get('elev', 0)
        cshare = coast[i] / max(perim[i], 1)
        has_river = any(rb > 2 for k, rb in river_border.items() if i in k) or (R & (L == i)).sum() > 6
        terrain = 'mountain' if e >= 450 else 'coast' if cshare > 0.12 else 'river' if has_river and e < 250 else 'plain'
        is_si = r['name'].endswith('시')
        lms = [l for l in landmarks if lm_region[l['id']] == r['id']]
        port = cshare > 0.05 and (any(l['type'] == 'port' for l in lms) or (p['port'] and i == seat[r['parent']]) or (p['port'] and cshare > 0.25))
        fortress = any(l['type'] == 'fortress' for l in lms) or (p['fortress'] and i == seat[r['parent']]) or e >= 700
        name = r['name'] if names[r['name']] == 1 else f"{r['name']}({r['province'] if r['province'] != '북' else '북'})"
        clamp = lambda v: int(max(5, min(100, round(v))))
        out_c.append({
            'id': r['id'], 'name': name, 'lon': r['lon'], 'lat': r['lat'], 'elev': e, 'terrain': terrain,
            'fortress': bool(fortress), 'port': bool(port),
            'population': int(round(p['population'] * share / 100) * 100) or 500,
            'agriculture': clamp(p['agriculture'] + (12 if e < 100 else 0) - (18 if e >= 450 else 0)),
            'commerce': clamp(p['commerce'] + (12 if is_si else -8) + (10 if port else 0)),
            'wall': clamp(25 + (20 if is_si else 0) + (30 if fortress else 0) + (15 if i == seat[r['parent']] else 0)),
            'wood': int(max(1, min(5, round(1 + e / 250)))), 'iron': int(max(1, min(5, p['iron'] - (0 if i == seat[r['parent']] else 1)))),
            'parent': r['parent'], 'seat': i == seat[r['parent']],
        })
    # 길
    roads = []
    linked = set()
    for (a, b), cnt in border.items():
        if cnt < 4: continue
        ra, rb = out_c[a - 1], out_c[b - 1]
        ea, eb = ra['elev'], rb['elev']
        t = 'pass' if (min(ea, eb) >= 400 or abs(ea - eb) >= 350) else 'river' if river_border.get((a, b), 0) >= 3 else 'land'
        roads.append({'from': ra['id'], 'to': rb['id'], 'type': t}); linked |= {a, b}
    # 섬·고립 시·군: 가장 가까운 해안 시·군과 해로
    def comp():
        adj = {i: set() for i in range(1, n + 1)}
        idx = {c['id']: k for k, c in enumerate(out_c, start=1)}
        for rd in roads: adj[idx[rd['from']]].add(idx[rd['to']]); adj[idx[rd['to']]].add(idx[rd['from']])
        seen = {}; cid = 0
        for s0 in range(1, n + 1):
            if s0 in seen: continue
            cid += 1; st = [s0]; seen[s0] = cid
            while st:
                u = st.pop()
                for v in adj[u]:
                    if v not in seen: seen[v] = cid; st.append(v)
        return seen
    for _ in range(30):
        seen = comp()
        sizes = {}
        for v in seen.values(): sizes[v] = sizes.get(v, 0) + 1
        main_c = max(sizes, key=sizes.get)
        small = [i for i in range(1, n + 1) if seen[i] != main_c]
        if not small: break
        grp = seen[small[0]]
        members = [i for i in small if seen[i] == grp]
        best = None
        for a in members:
            for b in range(1, n + 1):
                if seen[b] != main_c: continue
                dd = (out_c[a - 1]['lon'] - out_c[b - 1]['lon']) ** 2 + ((out_c[a - 1]['lat'] - out_c[b - 1]['lat']) * 1.25) ** 2
                if best is None or dd < best[0]: best = (dd, a, b)
        _, a, b = best
        roads.append({'from': out_c[a - 1]['id'], 'to': out_c[b - 1]['id'], 'type': 'sea'})
        out_c[a - 1]['port'] = out_c[b - 1]['port'] = True
    json.dump({'cities': out_c, 'roads': roads, 'landmarkRegion': lm_region}, open(os.path.join(ROOT, 'data/geo/region_graph.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    from collections import Counter
    print('cities', len(out_c), 'roads', len(roads), Counter(r['type'] for r in roads), Counter(c['terrain'] for c in out_c), 'ports', sum(c['port'] for c in out_c), 'forts', sum(c['fortress'] for c in out_c))

if __name__ == '__main__':
    main(sys.argv[1])
