"""군현 지도 경제 맞추기 (v3.8) — data/geo/region_graph.json
관할 도시(24곳)마다 속한 시·군의
  - 인구 합 = 관할 도시 인구 × (전국 공통 비율)
  - 인구 가중 평균 상업·농업 = 관할 도시의 상업·농업
이 되도록 맞춘다. 시·군 사이의 차이(광역시 인구, 항구 상업, 수원시 성벽 등)는 그대로 두고 총량만 맞춘다.
그래서 군현 지도에서도 세력별 경제 규모가 24곳 지도와 같은 비율이 된다 (촉 쏠림 완화).
여러 번 돌려도 결과가 같다.
사용: python3 -I tools/data/normalize_region_economy.py
"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
clamp = lambda v: int(max(5, min(100, round(v))))

def main():
    gp = os.path.join(ROOT, 'data/geo/region_graph.json')
    graph = json.load(open(gp))
    cities = {c['id']: c for c in json.load(open(os.path.join(ROOT, 'data/cities.json')))}
    kids = {}
    for r in graph['cities']: kids.setdefault(r['parent'], []).append(r)
    k = sum(r['population'] for r in graph['cities']) / sum(cities[p]['population'] for p in kids)
    for p, rs in kids.items():
        tot = sum(r['population'] for r in rs)
        target = cities[p]['population'] * k
        for r in rs: r['population'] = max(100, int(round(r['population'] * target / tot / 100) * 100))
        for field in ('commerce', 'agriculture'):
            want = cities[p][field]
            for _ in range(8):
                pop = sum(r['population'] for r in rs)
                avg = sum(r[field] * r['population'] for r in rs) / pop
                d = want - avg
                if abs(d) < 0.5: break
                for r in rs: r[field] = clamp(r[field] + d)
    graph['economyNormalized'] = True
    json.dump(graph, open(gp, 'w'), ensure_ascii=False, separators=(',', ':'))
    print('공통 인구 비율', round(k, 3))

if __name__ == '__main__':
    main()
