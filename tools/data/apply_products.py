"""v4.0 지역 산물 — 쌀·철·목재·말을 지역별 실제 경향에 맞춰 비율로 다시 나눈다.
근거·출처: docs/history/products-v4.0.md (1960년대~현재의 지역별 경향을 게임 수치로 옮긴 것, 실제 통계 그대로가 아님)
- 쌀: 호남(전남·전북)·충남·황해남도(재령·연백평야)·평남이 곡창
- 철: 무산(함북, 청진 관할)·은률·재령(황해, 해주 관할)·양양·삼척(강원), 충주(청주 관할)
- 목재: 양강(혜산)·자강(강계)·함경 산간, 강원 산지
- 말: 제주(조선시대 국영 목장의 중심) > 관북·관서 북방
region_graph.json 의 productsVersion 으로 한 번만 적용.
사용: python3 -I tools/data/apply_products.py
"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VERSION = 1
CITY = {
    'haeju':     dict(agriculture=72, iron=4),
    'pyongyang': dict(agriculture=64),
    'chongjin':  dict(iron=6),
    'gangneung': dict(iron=4, wood=5),
    'cheongju':  dict(iron=3),
    'ganggye':   dict(wood=6),
    'hyesan':    dict(wood=7),
    'chuncheon': dict(wood=5),
    'gongju':    dict(agriculture=72),  # 충남 곡창
}
HORSES = {'jeju': 6, 'hamhung': 2, 'chongjin': 2, 'hyesan': 1, 'uiju': 2}
# 군현 지도: 특정 시·군 보정
COUNTY = {'무산군': dict(iron=7), '은률군': dict(iron=5), '재령군': dict(iron=4), '양양군': dict(iron=4), '삼척시': dict(iron=4), '충주시': dict(iron=4)}

def main():
    cp = os.path.join(ROOT, 'data/cities.json'); cities = json.load(open(cp))
    for c in cities:
        c.update(CITY.get(c['id'], {}))
        c['horses'] = HORSES.get(c['id'], 0)
    json.dump(cities, open(cp, 'w'), ensure_ascii=False, indent=1)
    gp = os.path.join(ROOT, 'data/geo/region_graph.json'); g = json.load(open(gp))
    if g.get('productsVersion', 0) >= VERSION:
        print('군현 지도는 이미 적용됨'); return
    kids = {}
    for c in g['cities']: kids.setdefault(c['parent'], []).append(c)
    for pid, lst in kids.items():
        h = HORSES.get(pid, 0)
        for c in lst:
            c['horses'] = (3 if pid == 'jeju' else (1 if c.get('seat') else 0)) if h else 0
            if pid in CITY and 'agriculture' in CITY[pid]:
                c['agriculture'] = min(100, c['agriculture'] + 8)
    for c in g['cities']:
        c.update(COUNTY.get(c['name'], {}))
    g['productsVersion'] = VERSION
    json.dump(g, open(gp, 'w'), ensure_ascii=False, separators=(',', ':'))
    print('적용', sum(1 for c in g['cities'] if c['horses']), '말 시·군')

main()
