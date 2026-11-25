"""시·군 중심점의 '추정' 평균 고도 → data/geo/regions.json 의 elev 필드 (v0.6)

실측 DEM(SRTM·Copernicus)은 이 개발 환경에서 내려받을 수 없어, 주요 산과 산맥·고원 위치로 만든
근사 모델이다. 게임 연출과 지형 지도용이며 실제 고도와 다를 수 있다 (추정).
Phase 1에서 실측 DEM으로 교체할 것.
"""
import json, math, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# (이름, 경도, 위도, 높이m, 영향 반경 km)
PEAKS = [
    ('백두산', 128.08, 42.0, 2744, 60), ('관모봉', 129.2, 41.7, 2541, 55), ('북포태산', 128.6, 41.6, 2289, 50),
    ('두류산', 128.3, 41.1, 2309, 55), ('낭림산', 126.9, 40.35, 2186, 60), ('묘향산', 126.2, 40.0, 1909, 40),
    ('희사봉', 127.6, 40.6, 2117, 60), ('차일봉', 128.0, 40.9, 2505, 60), ('오가산', 126.4, 40.9, 1700, 45),
    ('금강산', 128.05, 38.65, 1638, 40), ('설악산', 128.46, 38.12, 1708, 35), ('오대산', 128.54, 37.8, 1563, 35),
    ('태백산', 128.92, 37.1, 1567, 35), ('소백산', 128.5, 36.96, 1440, 30), ('속리산', 127.87, 36.54, 1058, 30),
    ('덕유산', 127.75, 35.86, 1614, 35), ('지리산', 127.73, 35.34, 1915, 40), ('가야산', 128.12, 35.82, 1430, 25),
    ('팔공산', 128.7, 36.0, 1192, 25), ('주왕산', 129.17, 36.4, 720, 30), ('계룡산', 127.2, 36.35, 845, 20),
    ('한라산', 126.53, 33.36, 1950, 18), ('추가령', 127.4, 38.7, 1100, 40), ('멸악산', 126.0, 38.4, 816, 30),
    ('언진산', 126.6, 38.75, 1120, 30), ('마식령', 127.3, 39.05, 1200, 35), ('치악산', 128.06, 37.37, 1288, 25),
]
PLATEAU = (127.3, 129.2, 40.6, 41.8, 1100)  # 개마고원: 경도·위도 범위, 기저 고도

def km(lon1, lat1, lon2, lat2):
    k = math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot((lon1 - lon2) * 111 * k, (lat1 - lat2) * 111)

def elev(lon, lat):
    h = 40.0
    for _, plon, plat, ph, r in PEAKS:
        d = km(lon, lat, plon, plat)
        h = max(h, ph * 0.55 * math.exp(-(d / r) ** 2))
    a, b, c, d2, base = PLATEAU
    if a <= lon <= b and c <= lat <= d2:
        h = max(h, base)
    # 동고서저: 동해안 쪽 산지 보정
    east = max(0, min(lon, 128.9) - 127.6) * 160 if 35.8 < lat < 38.4 else 0
    return round(min(2000, h + east * 0.5))

p = os.path.join(ROOT, 'data/geo/regions.json')
regions = json.load(open(p))
for r in regions:
    r['elev'] = elev(r['lon'], r['lat'])
json.dump(regions, open(p, 'w'), ensure_ascii=False, separators=(',', ':'))
print(sorted(((r['elev'], r['name']) for r in regions), reverse=True)[:12])
print(sorted(((r['elev'], r['name']) for r in regions))[:6])
