"""전국 시·군 경계 → data/geo/regions.json 생성 (v0.5)

원본 데이터 (각 라이선스 확인):
- 남한: southkorea/southkorea-maps, kostat 2013 시군구 (skorea_municipalities_geo_simple.json)
  https://github.com/southkorea/southkorea-maps
- 북한: geoBoundaries PRK ADM2 (CC BY 4.0) https://www.geoboundaries.org
사용: python3 tools/geo/build_regions.py <skorea_municipalities.json> <prk_adm2.geojson>

처리:
- 특별·광역시의 구는 하나의 시로 합침(군은 유지), 도의 'X시Y구'는 X시로 합침, 청원군은 청주시로 합침(2014 통합)
- 북한 지명은 한글로 바꾸고, 현대 정치 인물 이름 지명은 옛 이름을 씀 (김책시→성진, 김형직군→후창 등)
- Douglas–Peucker로 단순화, 좌표 소수 3자리
- 각 시·군은 가장 가까운 게임 도시(data/cities.json)의 관할로 배정
"""
import json, math, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TOL = 0.012

METRO = {'11': '서울', '21': '부산', '22': '대구', '23': '인천', '24': '광주', '25': '대전', '26': '울산', '29': '세종'}
PROV = {'31': '경기', '32': '강원', '33': '충북', '34': '충남', '35': '전북', '36': '전남', '37': '경북', '38': '경남', '39': '제주',
        **{k: v for k, v in METRO.items()}}

NK = {
 'Anak':'안악군','Anbyon':'안변군','Anju City':'안주시','Changdo':'창도군','Changsong':'창성군','Chollima':'천리마','Cholsan':'철산군',
 'Cholwon':'철원군(북)','Chongdan':'청단군','Chongjin City':'청진시','Chongnam':'청남','Chonma':'천마군','Chonnae':'천내군','Chosan':'초산군',
 'Haeju City':'해주시','Hamhung City':'함흥시','Hamju':'함주군','Hochon':'허천군','Hoechang':'회창군','Hoeryong City':'회령시','Hoeyang':'회양군',
 'Hongwon':'홍원군','Huichon City':'희천시','Hwadae':'화대군','Hwangju':'황주군','Hwaphyong':'화평군','Hyangsan':'향산군','Hyesan City':'혜산시',
 'Ichon':'이천군','Jaerong':'재령군','Janggang':'장강군','Jangjin':'장진군','Jangphung':'장풍군','Jangyon':'장연군','Jasong':'자성군',
 'Jonchon':'전천군','Jongju City':'정주시','Jongphyong':'정평군','Junggang':'중강군','Junghwa':'중화군','Jungsan':'증산군','Kabsan':'갑산군',
 'Kaechon City':'개천시','Kaesong City':'개성시','Kangdong':'강동군','Kanggye City':'강계시','Kangnam':'강남군','Kangryong':'강령군',
 'Kangso':'강서군','Kilju':'길주군','Kim Chaek City':'성진','Kim Hyong Gwon':'풍산군','Kim Hyong Jik':'후창군','Kim Jong Suk':'신파군',
 'Kimhwa':'김화군','Koksan':'곡산군','Kophung':'고풍군','Kosan':'고산군','Kosong':'고성군(북)','Kowon':'고원군','Kujang':'구장군',
 'Kumchon':'금천군','Kumgang':'금강군','Kumho':'금호','Kumya':'금야군','Kusong City':'구성시','Kwail':'과일군','Kwaksan':'곽산군',
 'Kyonghung':'경흥군','Kyongsong':'경성군','Kyongwon':'경원군','Maengsan':'맹산군','Manpho City':'만포시','Munchon City':'문천시',
 'Mundok':'문덕군','Musan':'무산군','Myongchon':'명천군','Myonggan':'명간군','Nampo City':'남포시','Nyongbyon':'영변군','Nyongwon':'영원군',
 'Onchon':'온천군','Ongjin':'옹진군(북)','Onsong':'온성군','Orang':'어랑군','Paechon':'배천군','Paekam':'백암군','Pakchon':'박천군',
 'Phangyo':'판교군','Phihyon':'피현군','Phungso':'풍서군','Phyonggang':'평강군','Phyongsan':'평산군','Pochon':'보천군','Pongchon':'봉천군',
 'Pongsan':'봉산군','Popdong':'법동군','Pujon':'부전군','Pukchang':'북창군','Pukchong':'북청군','Puryong':'부령군','Pyokdong':'벽동군',
 'Pyoksong':'벽성군','Pyongsong City':'평성시','Pyongwon':'평원군','Pyongyang':'평양','Rakwon':'낙원군','Rangrim':'낭림군','Rason City':'나선',
 'Rinsan':'인산군','Riwon':'이원군','Ryongchon':'용천군','Ryonggang':'용강군','Ryongrim':'용림군','Ryongyon':'용연군','Sakju':'삭주군',
 'Samchon':'삼천군','Samjiyon':'삼지연','Samsu':'삼수군','Sangwon':'상원군','Sariwon City':'사리원시','Sepho':'세포군','Sijung':'시중군',
 'Sinchon':'신천군','Sindo':'신도군','Sinhung':'신흥군','Sinkye':'신계군','Sinpho City':'신포시','Sinphyong':'신평군','Sinuiju City':'신의주시',
 'Sinwon':'신원군','Sinyang':'신양군','Sohung':'서흥군','Sonchon':'선천군','Songchon':'성천군','Songgan':'성간군','Songhwa':'송화군',
 'Songrim City':'송림시','Songwon':'송원군','Suan':'수안군','Sudong':'수동','Sukchon':'숙천군','Sunchon City':'순천시(북)','Taean':'대안',
 'Taedong':'대동군','Taegwan':'대관군','Taehongdan':'대홍단군','Taehung':'대흥군','Tanchon City':'단천시','Thaechon':'태천군','Thaethan':'태탄군',
 'Thongchon':'통천군','Thosan':'토산군','Tokchon City':'덕천시','Toksong':'덕성군','Tongchang':'동창군','Tongrim':'동림군','Tongsin':'동신군',
 'Tukjang':'득장','Uiju':'의주군','Unchon':'은천군','Unhung':'운흥군','Unjon':'운전군','Unjong Dist.':'은정','Unpha':'은파군','Unryul':'은률군',
 'Usi':'우시군','Wiwon':'위원군','Wonsan City':'원산시','Yangdok':'양덕군','Yodok':'요덕군','Yomju':'염주군','Yonan':'연안군','Yonggwang':'영광군(북)',
 'Yonsa':'연사군','Yonsan':'연산군','Yonthan':'연탄군',
}

def rings(geom):
    if geom['type'] == 'Polygon':
        return [geom['coordinates'][0]]
    return [p[0] for p in geom['coordinates']]

def dp(pts, tol):
    if len(pts) < 4:
        return pts
    def d(p, a, b):
        (x, y), (x1, y1), (x2, y2) = p, a, b
        dx, dy = x2 - x1, y2 - y1
        if dx == dy == 0:
            return math.hypot(x - x1, y - y1)
        return abs(dy * x - dx * y + x2 * y1 - y2 * x1) / math.hypot(dx, dy)
    stack, keep = [(0, len(pts) - 1)], {0, len(pts) - 1}
    while stack:
        i, j = stack.pop()
        best, idx = 0, None
        for k in range(i + 1, j):
            v = d(pts[k], pts[i], pts[j])
            if v > best:
                best, idx = v, k
        if idx is not None and best > tol:
            keep.add(idx); stack += [(i, idx), (idx, j)]
    return [pts[k] for k in sorted(keep)]

def area_centroid(ring):
    a = cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        c = x1 * y2 - x2 * y1
        a += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c
    if abs(a) < 1e-12:
        return 0, ring[0][0], ring[0][1]
    return a / 2, cx / (3 * a), cy / (3 * a)

def lon_scale(lat):
    return math.cos(math.radians(lat))

def main(sk_path, nk_path):
    cities = json.load(open(os.path.join(ROOT, 'data/cities.json')))
    groups = {}  # key -> {name, province, rings}
    for f in json.load(open(sk_path))['features']:
        code, name = f['properties']['code'], f['properties']['name']
        p2 = code[:2]
        if p2 in METRO and name.endswith('구'):
            key, nm = 'm' + p2, METRO[p2] + ('특별시' if p2 == '11' else '특별자치시' if p2 == '29' else '광역시')
        elif p2 in METRO and p2 == '29':
            key, nm = 'm29', '세종특별자치시'
        elif '시' in name and name.endswith('구') and not p2 in METRO:
            nm = name[:name.index('시') + 1]; key = 's' + p2 + nm
        elif name == '청원군':
            nm, key = '청주시', 's33청주시'
        else:
            nm, key = name, 's' + code
        g = groups.setdefault(key, {'name': nm, 'province': PROV.get(p2, ''), 'rings': []})
        g['rings'] += rings(f['geometry'])
    seen = {}
    for f in json.load(open(nk_path))['features']:
        en = f['properties']['shapeName']
        nm = NK.get(en, en)
        if en == 'Unsan':
            c = area_centroid(rings(f['geometry'])[0])
            nm = '운산군' if c[2] > 39.8 else '은산군'
        key = 'n' + nm
        g = groups.setdefault(key, {'name': nm, 'province': '북', 'rings': []})
        g['rings'] += rings(f['geometry'])
    out = []
    for key, g in groups.items():
        rs = []
        best = (0, 0, 0)
        for r in g['rings']:
            r = [(round(x, 3), round(y, 3)) for x, y in r]
            a = area_centroid(r)
            if abs(a[0]) > abs(best[0]):
                best = a
            s = dp(r, TOL)
            if len(s) >= 4 and abs(area_centroid(s)[0]) > 0.0004:
                rs.append(s)
        if not rs:
            continue
        _, lon, lat = best
        k = lon_scale(lat)
        parent = min(cities, key=lambda c: ((c['lon'] - lon) * k) ** 2 + (c['lat'] - lat) ** 2)['id']
        rid = 'r' + str(len(out) + 1).zfill(3)
        out.append({'id': rid, 'name': g['name'], 'province': g['province'], 'lon': round(lon, 3), 'lat': round(lat, 3),
                    'parent': parent, 'rings': [[[x, y] for x, y in r] for r in rs]})
    out.sort(key=lambda r: (-r['lat'], r['lon']))
    os.makedirs(os.path.join(ROOT, 'data/geo'), exist_ok=True)
    json.dump(out, open(os.path.join(ROOT, 'data/geo/regions.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print(len(out), 'regions,', sum(len(r) for o in out for r in o['rings']), 'points')

if __name__ == '__main__':
    main(*sys.argv[1:3])
