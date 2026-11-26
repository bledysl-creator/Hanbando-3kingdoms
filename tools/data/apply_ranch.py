"""v4.1 마창(말 목장) 규모: 대(3)·중(2)·소(1)·없음(0)
- 대도시(인구 7만 이상, 평양·서울 등)는 대
- 평지 중소도시: 인구 4만 이상 중, 그 밖은 소 / 구릉 소 / 넓은 분지 소 / 산악 없음
- 제주는 대 (말 산지 등급과 별개, 조선시대 국영 목장)
군현 지도는 인구 기준을 1/12로 맞춘다. region_graph.json 의 ranchVersion 으로 한 번만.
사용: python3 -I tools/data/apply_ranch.py
"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def level(c, div=1, jeju=False):
    if jeju: return 3
    pop, lf, rel = c['population'], c.get('landform', 'plain'), c.get('relief', 20)
    if pop >= 70000 / div: return 3
    if lf == 'plain': return 2 if pop >= 40000 / div else 1
    if lf == 'hill': return 1
    if lf == 'basin': return 1 if rel < 45 else 0
    return 0

cp = os.path.join(ROOT, 'data/cities.json'); cities = json.load(open(cp))
for c in cities: c['ranch'] = level(c, 1, c['id'] == 'jeju')
json.dump(cities, open(cp, 'w'), ensure_ascii=False, indent=1)
print({c['name']: c['ranch'] for c in cities})
gp = os.path.join(ROOT, 'data/geo/region_graph.json'); g = json.load(open(gp))
for c in g['cities']: c['ranch'] = level(c, 12, c['parent'] == 'jeju')
g['ranchVersion'] = 1
json.dump(g, open(gp, 'w'), ensure_ascii=False, separators=(',', ':'))
from collections import Counter
print('군현', Counter(c['ranch'] for c in g['cities']))
