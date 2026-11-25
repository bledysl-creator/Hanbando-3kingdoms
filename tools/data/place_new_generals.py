"""v3.4 원문 분석으로 추가한 장수를 197년 시나리오에 배치한다.
- 197년 전에 죽은 인물은 넣지 않는다 (190년 시나리오에는 build_190.py가 재야로 넣음)
- 197년에 16세 이상: 연의의 주된 소속(위·촉·오)이면 그 세력 도시에 고르게, 아니면 재야
- 16세 미만: 성인이 되는 해에 등장 (소속 세력 유지)
실행: python3 -I tools/data/place_new_generals.py
"""
import json, os, hashlib
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
P = lambda *a: os.path.join(ROOT, *a)
gens = {g['id']: g for g in json.load(open(P('data/generals.json'), encoding='utf-8'))}
meta = json.load(open(P('tools/data/novel_new_meta.json'), encoding='utf-8'))
path = P('data/scenarios/197_sabun.json')
raw = open(path, encoding='utf-8').read()
sc = json.loads(raw)
YEAR = sc['year']
cities = list(sc['cities'])
own = {}
for cid, c in sc['cities'].items():
    if c['owner']: own.setdefault(c['owner'], []).append(cid)
h = lambda s: int(hashlib.md5(s.encode()).hexdigest()[:8], 16)
cnt = {}
for gid, m in meta.items():
    g = gens[gid]
    if gid in sc['generals'] or gid in sc.get('debuts', {}): continue
    if m['death'] is not None and m['death'] < YEAR: continue
    fac = m['fac'] if m['fac'] in own else None
    if YEAR - g['birth'] >= 16:
        if fac:
            i = cnt.get(fac, 0); cnt[fac] = i + 1
            city = own[fac][(h(gid) + i) % len(own[fac])]
            sc['generals'][gid] = {'faction': fac, 'city': city, 'loyalty': 60 + h(gid) % 25}
        else:
            sc['generals'][gid] = {'faction': None, 'city': cities[h(gid) % len(cities)], 'loyalty': 0}
    else:
        city = own[fac][h(gid) % len(own[fac])] if fac else cities[h(gid) % len(cities)]
        sc['debuts'][gid] = {'year': g['birth'] + 16, 'city': city, 'faction': fac}
indent = 2
json.dump(sc, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=indent)
open(path, 'a').write('\n')
print('placed', len(sc['generals']), 'debuts', len(sc['debuts']), cnt)
