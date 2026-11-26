"""v4.0 지형 구조화: 실측 DEM(Terrarium 타일, build_terrain.py와 같은 캐시)으로 도시마다
- relief  (0~100): 반경 15km 고도 표준편차 → 산악도 (험할수록 기병·대군이 힘을 못 씀, 매복이 쉬움)
- basin   (0~1)  : 중심(반경 3km)보다 둘레(8~22km) 능선이 200m 이상 높은 방향의 비율 → 분지(펀치볼) 정도
- landform: 'basin'(분지) / 'mountain'(산악) / 'hill'(구릉) / 'plain'(평지)
를 계산해 data/cities.json 과 data/geo/region_graph.json 에 넣는다.

사용: python3 -I tools/geo/build_relief.py /tmp/dem_cache
"""
import json, math, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_terrain import build_sampler, ROOT  # noqa: E402

KM_LAT = 1 / 111.0

def measure(sample, lon, lat):
    klon = KM_LAT / math.cos(math.radians(lat))
    # 반경 15km 원판 표본
    rs = np.linspace(0, 15, 16)
    ang = np.linspace(0, 2 * math.pi, 32, endpoint=False)
    R, A = np.meshgrid(rs, ang)
    disk = np.clip(sample(lon + R * np.cos(A) * klon, lat + R * np.sin(A) * KM_LAT), 0, 2750)
    std = float(np.std(disk))
    center = float(np.mean(np.clip(sample(lon + np.array([0, 1.5, -1.5, 0, 0, 3, -3]) * klon, lat + np.array([0, 0, 0, 1.5, -1.5, 0, 0]) * KM_LAT), 0, 2750)))
    # 둘레 능선: 방향 16개마다 8~22km 사이 최고점
    enclosed = 0
    ridge = []
    for a in np.linspace(0, 2 * math.pi, 16, endpoint=False):
        d = np.linspace(8, 22, 15)
        h = np.clip(sample(lon + d * math.cos(a) * klon, lat + d * math.sin(a) * KM_LAT), -10, 2750)
        top = float(np.max(h))
        ridge.append(top)
        if top - center >= 200: enclosed += 1
    return std, center, enclosed / 16, float(np.mean(ridge))

# 보정 (추정): 제주 성읍은 해안·중산간 초원 — 15km 안의 한라산 때문에 산악으로 잡히지만 말을 키우던 들판이다
OVERRIDE = {'jeju': 'hill'}

def classify(relief, basin):
    if basin >= 0.66 and relief >= 20: return 'basin'
    if relief >= 55: return 'mountain'
    if relief >= 25: return 'hill'
    return 'plain'

def main(cache):
    sample = build_sampler(cache)
    out = {}
    cp = os.path.join(ROOT, 'data/cities.json')
    cities = json.load(open(cp))
    for c in cities:
        std, center, enc, ridge = measure(sample, c['lon'], c['lat'])
        c['relief'] = int(round(min(100, std / 4)))
        c['basin'] = round(enc, 2)
        c['landform'] = OVERRIDE.get(c['id'], classify(c['relief'], c['basin']))
        out[c['id']] = (c['name'], c['relief'], c['basin'], c['landform'], round(center), round(ridge))
    json.dump(cities, open(cp, 'w'), ensure_ascii=False, indent=1)
    gp = os.path.join(ROOT, 'data/geo/region_graph.json')
    g = json.load(open(gp))
    cnt = {}
    for c in g['cities']:
        std, center, enc, ridge = measure(sample, c['lon'], c['lat'])
        c['relief'] = int(round(min(100, std / 4)))
        c['basin'] = round(enc, 2)
        c['landform'] = classify(c['relief'], c['basin'])
        cnt[c['landform']] = cnt.get(c['landform'], 0) + 1
    json.dump(g, open(gp, 'w'), ensure_ascii=False, separators=(',', ':'))
    for k, v in out.items(): print(k, v)
    print('군현', cnt)

if __name__ == '__main__':
    main(sys.argv[1])
