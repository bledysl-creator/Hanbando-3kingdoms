"""Natural Earth 10m 하천 중심선(공공 도메인)에서 한반도 큰 강을 뽑아 data/geo/rivers.json을 만든다.
NE에 없는 강(대동강·청천강·금강·임진강·북한강·영산강·섬진강)은 주요 지점을 손으로 이은 추정선(estimated: true).
사용: python3 -I tools/geo/build_rivers.py <ne_10m_rivers_lake_centerlines.geojson> data/geo/rivers.json
"""
import json, sys

NAME_KO = {'Tumen': '두만강', 'Yalu': '압록강', 'Han': '한강', 'Namhan': '남한강', 'Nakdong': '낙동강'}
MANUAL = [
    ('대동강', [[126.95, 39.95], [126.6, 39.55], [126.3, 39.2], [125.95, 39.08], [125.75, 39.02], [125.55, 38.85], [125.3, 38.75]]),
    ('청천강', [[126.75, 40.35], [126.35, 40.05], [125.95, 39.75], [125.6, 39.62], [125.45, 39.6]]),
    ('금강', [[127.6, 35.75], [127.65, 36.05], [127.6, 36.35], [127.4, 36.5], [127.13, 36.46], [126.95, 36.3], [126.85, 36.15], [126.7, 36.0]]),
    ('임진강', [[127.35, 38.75], [127.1, 38.35], [126.95, 38.05], [126.75, 37.85], [126.68, 37.75]]),
    ('북한강', [[127.95, 38.35], [127.75, 38.05], [127.72, 37.88], [127.5, 37.75], [127.32, 37.53]]),
    ('영산강', [[126.98, 35.3], [126.85, 35.13], [126.7, 35.0], [126.55, 34.87], [126.4, 34.79]]),
    ('섬진강', [[127.3, 35.6], [127.35, 35.35], [127.55, 35.15], [127.75, 34.98]]),
]

def inside(x, y):
    return 124.0 <= x <= 131.0 and 33.0 <= y <= 43.0

def simplify(pts, step):
    out = pts[::step]
    if out[-1] != pts[-1]:
        out.append(pts[-1])
    return [[round(x, 3), round(y, 3)] for x, y in out]

def main(src, dst):
    d = json.load(open(src))
    rivers = []
    for f in d['features']:
        name = f['properties'].get('name')
        g = f['geometry']
        if not g or name not in NAME_KO:
            continue
        lines = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
        for line in lines:
            pts = [p for p in line if inside(*p)]
            if len(pts) < 2:
                continue
            rivers.append({'name': NAME_KO[name], 'source': 'Natural Earth 10m', 'estimated': False, 'pts': simplify(pts, 3)})
    for name, pts in MANUAL:
        rivers.append({'name': name, 'source': '추정(주요 지점 연결)', 'estimated': True, 'pts': pts})
    json.dump(rivers, open(dst, 'w'), ensure_ascii=False)
    print(len(rivers), 'lines')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
