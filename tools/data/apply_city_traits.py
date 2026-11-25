"""지역별 도시 특성(v3.5) — data/cities.json(24곳)과 data/geo/region_graph.json(345곳)에 반영.
근거: docs/history/city-traits.md (게임 수치이며 실제 통계를 그대로 옮긴 것이 아님)
- 호남: 농업↑ / 경상: 상업↑ / 서울·수원: 상업·인구↑, 수원(수원화성) 성벽 최고
- 광역시 이상: 인구↑
- 북한: 중국 접경(압록·두만) 성벽↑, 주요 도시 인구·상업↑(2008 인구조사 순위), 해안 상업 약간↑
한 번만 적용된다 (region_graph.json의 traitsVersion으로 확인).
사용: python3 -I tools/data/apply_city_traits.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VERSION = 1

# 24개 도시: 새 값 (지정한 필드만)
CITY = {
    'hanyang':  dict(name='서울', population=120000, agriculture=55, commerce=88),
    'suwon':    dict(population=72000, commerce=72, wall=96),
    'jeonju':   dict(agriculture=94),
    'gwangju':  dict(population=66000, agriculture=90),
    'naju':     dict(agriculture=88, commerce=55),
    'gongju':   dict(population=50000),            # 대전·세종 관할
    'daegu':    dict(population=76000, agriculture=48, commerce=76),
    'gyeongju': dict(population=74000, agriculture=50, commerce=78),  # 울산 관할
    'jinju':    dict(agriculture=55, commerce=60),
    'busan':    dict(population=88000, agriculture=35, commerce=90),
    'gangneung': dict(commerce=50),
    'jeju':     dict(commerce=46),
    # 북한
    'pyongyang': dict(population=110000, commerce=80, wall=85),     # 유상(柳商), 평양성
    'kaesong':  dict(commerce=78),                                   # 송상(松商)
    'uiju':     dict(population=48000, commerce=62, wall=90),        # 만상(灣商), 의주성·천리장성 기점
    'anju':     dict(wall=70),                                       # 안주성, 청천강 방어선
    'ganggye':  dict(population=28000, wall=86),                     # 4군, 압록강 상류 접경
    'hyesan':   dict(population=20000, wall=82),                     # 혜산진, 압록강 접경
    'chongjin': dict(population=46000, commerce=50, wall=80),        # 6진, 두만강 접경 + 동해 항구
    'hamhung':  dict(population=72000, commerce=54),                 # 북한 2위 도시
    'wonsan':   dict(population=44000, commerce=56),                 # 동해 항구
    'haeju':    dict(agriculture=62, commerce=50),                   # 재령평야, 서해 항구
}

# 군현 지도: 중국(압록·두만)과 맞닿은 시·군
BORDER = {'신의주시', '의주군', '삭주군', '창성군', '벽동군', '용천군', '초산군', '위원군', '만포시', '자성군', '중강군',
          '후창군', '삼지연', '보천군', '혜산시', '신파군', '대홍단군', '삼수군', '무산군', '회령시', '온성군', '경원군', '경흥군', '나선'}
# 천리장성(1033~1044)·북방 방어선의 성읍
WALL_LINE = {'안주시', '정주시', '영변군', '구성시', '선천군', '철산군', '정평군'}
# 북한 주요 도시 2008 인구조사 (명). 인구 = max(현재, 인구/100)
NK_CENSUS = {'평양': 3255288, '함흥시': 768551, '청진시': 667929, '남포시': 366341, '원산시': 363127, '신의주시': 359341,
             '단천시': 345876, '개천시': 319554, '개성시': 308440, '사리원시': 307764, '순천시(북)': 297317, '평성시': 284386,
             '해주시': 273300, '강계시': 251971, '안주시': 240117, '덕천시': 237133, '성진': 207299, '나선': 196954,
             '구성시': 196515, '혜산시': 192680, '정주시': 189742, '희천시': 168180, '회령시': 153532, '신포시': 152759,
             '송림시': 128831, '문천시': 122934, '만포시': 116760}
SOUTH_METRO_MIN = 20000
NORTH_PARENTS = {'uiju', 'anju', 'ganggye', 'pyongyang', 'haeju', 'kaesong', 'hyesan', 'chongjin', 'hamhung', 'wonsan'}
HONAM = {'전북', '전남', '광주'}
YEONGNAM = {'경북', '경남', '부산', '대구', '울산'}

clamp = lambda v: int(max(5, min(100, round(v))))

def main():
    cp = os.path.join(ROOT, 'data/cities.json')
    gp = os.path.join(ROOT, 'data/geo/region_graph.json')
    cities = json.load(open(cp))
    graph = json.load(open(gp))
    if graph.get('traitsVersion', 0) >= VERSION:
        print('이미 적용됨'); return
    old = {c['id']: dict(c) for c in cities}
    for c in cities:
        for k, v in CITY.get(c['id'], {}).items(): c[k] = v
    new = {c['id']: c for c in cities}
    prov = {r['id']: r['province'] for r in json.load(open(os.path.join(ROOT, 'data/geo/regions.json')))}
    for r in graph['cities']:
        p0, p1 = old[r['parent']], new[r['parent']]
        r['population'] = int(round(r['population'] * p1['population'] / p0['population'] / 100) * 100)
        r['agriculture'] = clamp(r['agriculture'] + p1['agriculture'] - p0['agriculture'])
        r['commerce'] = clamp(r['commerce'] + p1['commerce'] - p0['commerce'])
        pv = prov.get(r['id'], '')
        north = r['parent'] in NORTH_PARENTS
        if pv in HONAM: r['agriculture'] = clamp(r['agriculture'] + 6)
        if pv in YEONGNAM: r['commerce'] = clamp(r['commerce'] + 6)
        if r['name'].endswith(('특별시', '광역시')):
            r['population'] = max(r['population'], SOUTH_METRO_MIN) if r['name'] != '서울특별시' else int(r['population'] * 1.25)
            r['commerce'] = clamp(r['commerce'] + 5)
        if r['name'] in NK_CENSUS:
            r['population'] = max(r['population'], NK_CENSUS[r['name']] // 100 // 100 * 100)
            r['commerce'] = clamp(r['commerce'] + 8)
        if north and r['port']: r['commerce'] = clamp(r['commerce'] + 5)
        if r['name'] in BORDER: r['wall'] = min(95, max(r['wall'] + 30, 80))
        elif r['name'] in WALL_LINE: r['wall'] = min(90, r['wall'] + 15)
        if r['name'] == '수원시':
            r['population'] = max(r['population'], 15000)
            r['commerce'] = clamp(r['commerce'] + 8)
        r['wall'] = min(r['wall'], 95)
    for r in graph['cities']:
        if r['name'] == '수원시': r['wall'] = 100  # 수원화성: 성벽 최고
    graph['traitsVersion'] = VERSION
    json.dump(cities, open(cp, 'w'), ensure_ascii=False, indent=1)
    json.dump(graph, open(gp, 'w'), ensure_ascii=False, separators=(',', ':'))
    print('적용 완료')

if __name__ == '__main__':
    main()
