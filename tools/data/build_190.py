"""v3.2 「190년 군웅할거」 시나리오 생성 (Game.md 3-2).
197년 시나리오와 같은 장수 데이터를 쓰되, 190년 당시의 소속(연의·정사 기준, 일부 추정)으로 다시 나눈다.
실행: python3 -I tools/data/build_190.py  → data/scenarios/190_gunung.json, generals.json·factions.json 보강
"""
import json, os, hashlib
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
P = lambda *a: os.path.join(ROOT, *a)
gens = json.load(open(P('data/generals.json')))
facs = json.load(open(P('data/factions.json')))
cities = {c['id']: c for c in json.load(open(P('data/cities.json')))}
sc197 = json.load(open(P('data/scenarios/197_sabun.json')))

# ── 새 장수 4명 (능력치는 우리가 정한 값, 생년 일부 추정 → docs/history/scenario-190.md)
NEW = [
    ('sun_jian', '손견', '孫堅', 155, (88, 90, 72, 68, 85), (72, 78, 30, 82, 82)),
    ('dong_zhuo', '동탁', '董卓', 141, (82, 84, 66, 30, 25), (98, 8, 95, 95, 70)),
    ('hua_xiong', '화웅', '華雄', 155, (78, 87, 38, 24, 40), (60, 55, 50, 80, 85)),
    ('li_ru', '이유', '李儒', 150, (42, 30, 88, 70, 36), (70, 40, 60, 60, 55)),
]
K = ['leadership', 'war', 'intellect', 'politics', 'charm']
PK = ['ambition', 'righteousness', 'greed', 'pride', 'risk']
have = {g['id'] for g in gens}
for gid, name, hanja, birth, st, pe in NEW:
    if gid not in have:
        gens.append({'id': gid, 'name': name, 'hanja': hanja, 'birth': birth, 'stats': dict(zip(K, st)), 'persona': dict(zip(PK, pe))})
json.dump(gens, open(P('data/generals.json'), 'w'), ensure_ascii=False, indent=1)

NEWFAC = [
    ('yuan', '원', '袁', '#b8a03a', 'yuan_shao', ['대군', '인재']),
    ('dong', '동', '董', '#5a4a3a', 'dong_zhuo', ['대군', '불안정']),
    ('gongsun', '공손', '公孫', '#e0e0d0', 'gongsun_zan', ['최강무력']),
    ('jing', '형', '荊', '#3a8a8a', 'liu_biao', ['곡창', '교역']),
    ('ma', '마', '馬', '#a06a2a', 'ma_teng', ['최강무력']),
    ('zhanglu', '장', '張', '#7a7ab0', 'zhang_lu', ['인덕']),
    ('yuanshu', '원술', '術', '#d07aa0', 'yuan_shu', ['교역']),
    ('yan', '엄', '嚴', '#4a7a5a', 'yan_baihu', ['수군']),
]
fids = {f['id'] for f in facs}
for fid, n, h, col, r, tr in NEWFAC:
    if fid not in fids:
        facs.append({'id': fid, 'name': n, 'hanja': h, 'color': col, 'rulerId': r, 'traits': tr})
open(P('data/factions.json'), 'w').write('[\n' + ',\n'.join('  ' + json.dumps(f, ensure_ascii=False) for f in facs) + '\n]\n')

OWN = {
    'wei': ['hanyang', 'suwon'], 'shu': ['cheongju', 'gongju'], 'wu': ['gyeongju', 'busan', 'jinju'],
    'yuan': ['pyongyang', 'anju', 'uiju'], 'dong': ['hamhung', 'chongjin', 'wonsan'], 'gongsun': ['chuncheon', 'gangneung'],
    'jing': ['jeonju', 'gwangju', 'naju'], 'ma': ['ganggye', 'hyesan'], 'zhanglu': ['haeju'], 'yuanshu': ['daegu'],
    'lu': ['kaesong'], 'yan': ['jeju'],
}
RULER = {'wei': 'cao_cao', 'shu': 'liu_bei', 'wu': 'sun_jian', 'yuan': 'yuan_shao', 'dong': 'dong_zhuo', 'gongsun': 'gongsun_zan',
         'jing': 'liu_biao', 'ma': 'ma_teng', 'zhanglu': 'zhang_lu', 'yuanshu': 'yuan_shu', 'lu': 'lu_bu', 'yan': 'yan_baihu'}
# 190년 소속 (없으면 재야)
MEM = {
    'wei': 'cao_cao xiahou_dun xiahou_yuan cao_ren cao_hong cao_chun yue_jin li_dian yu_jin dian_wei chen_gong cao_xiu han_hao',
    'shu': 'liu_bei guan_yu zhang_fei jian_yong',
    'wu': 'sun_jian cheng_pu huang_gai han_dang zhu_huan',
    'yuan': 'yuan_shao yan_liang wen_chou zhang_he gao_lan tian_feng ju_shou shen_pei feng_ji xu_you guo_tu qu_yi xun_yu xin_pi xin_ping guo_jia chunyu_qiong gao_gan yuan_xi',
    'dong': 'dong_zhuo hua_xiong li_ru li_jue guo_si xu_rong jia_xu zhang_xiu zhang_ji fan_chou li_meng',
    'gongsun': 'gongsun_zan zhao_yun',
    'jing': 'liu_biao cai_mao kuai_yue kuai_liang huang_zu wen_pin zhang_yun huang_zhong cai_zhong cai_he yi_ji',
    'ma': 'ma_teng han_sui pang_de yang_qiu',
    'zhanglu': 'zhang_lu yan_pu zhang_wei yang_song yang_ang yang_ren',
    'yuanshu': 'yuan_shu ji_ling zhang_xun lei_bo yang_hong han_yin',
    'lu': 'lu_bu zhang_liao gao_shun cao_xing hao_meng song_xian wei_xu hou_cheng cheng_lian',
    'yan': 'yan_baihu',
}
# 190년에 어린 인물이 어른이 되면 합류할 세력
YOUNG = {'sun_ce': 'wu', 'sun_quan': 'wu', 'zhou_yu': 'wu', 'sun_shao': 'wu', 'yuan_tan': 'yuan', 'yuan_shang': 'yuan', 'ma_chao': 'ma', 'ma_dai': 'ma',
         'liu_qi': 'jing', 'lu_lingqi': 'lu', 'cao_pi': 'wei', 'cao_zhi': 'wei', 'cao_zhen': 'wei', 'xiahou_shang': 'wei', 'guan_ping': 'shu', 'zhang_bao': 'shu', 'liu_shan': 'shu'}
fac_of = {g: f for f, s in MEM.items() for g in s.split()}
gmap = {g['id']: g for g in gens}
for g in fac_of: assert g in gmap, g

def h(s):
    return int(hashlib.md5(s.encode()).hexdigest()[:8], 16)

all_cities = list(cities)
out_gen, debuts = {}, {}
counter = {}
for g in gens:
    gid = g['id']
    old_debut = sc197['debuts'].get(gid)
    adult_year = g['birth'] + 16
    f = fac_of.get(gid)
    if adult_year > 190:
        fac = YOUNG.get(gid, f) or (old_debut or {}).get('faction')
        if fac not in OWN: fac = None
        year = max(adult_year, (old_debut or {}).get('year', 0)) if old_debut else adult_year
        city = OWN[fac][0] if fac else (old_debut or {}).get('city') or all_cities[h(gid) % len(all_cities)]
        debuts[gid] = {'year': year, 'city': city, 'faction': fac}
        continue
    if f:
        own = OWN[f]
        if gid == RULER[f]: city = own[0]
        else:
            i = counter.get(f, 0); counter[f] = i + 1
            city = own[i % len(own)]
        out_gen[gid] = {'faction': f, 'city': city, 'loyalty': 100 if gid == RULER[f] else 75 + h(gid) % 20}
    else:
        out_gen[gid] = {'faction': None, 'city': all_cities[h(gid) % len(all_cities)], 'loyalty': 0}

city_out = {}
for f, own in OWN.items():
    for i, cid in enumerate(own):
        t = round(cities[cid]['population'] * 0.22 / 1000) * 1000
        city_out[cid] = {'owner': f, 'troops': int(t * (1.3 if i == 0 else 1))}
fac_res = {}
for f, own in OWN.items():
    n = len(own)
    fac_res[f] = {'gold': 2000 + 1200 * n, 'food': 25000 + 18000 * n, 'wood': 8000 + 5000 * n, 'iron': 8000 + 5000 * n}
fac_res['dong']['gold'] += 3000  # 낙양의 재물을 쥔 동탁 (가상 설정)
fac_res['yuan']['food'] += 15000

coalition = ['yuan', 'wei', 'wu', 'yuanshu', 'gongsun', 'shu', 'jing', 'zhanglu']
treaties = [{'a': a, 'b': b, 'status': 'truce', 'turns': 4, 'note': '반동탁 연합 — 1년 휴전 (가상 설정)'} for i, a in enumerate(coalition) for b in coalition[i + 1:]]
treaties.append({'a': 'shu', 'b': 'gongsun', 'status': 'alliance', 'turns': None, 'note': '유비는 동문수학한 공손찬에게 의지했다'})

rel = [r for r in sc197['relations'] if r['a'] in gmap and r['b'] in gmap]
rel += [{'a': 'sun_jian', 'b': 'sun_ce', 'type': 'trust'}, {'a': 'sun_jian', 'b': 'cheng_pu', 'type': 'trust'}, {'a': 'sun_jian', 'b': 'huang_gai', 'type': 'trust'},
        {'a': 'dong_zhuo', 'b': 'li_ru', 'type': 'trust'}, {'a': 'sun_jian', 'b': 'hua_xiong', 'type': 'enmity'}, {'a': 'yuan_shao', 'b': 'yuan_shu', 'type': 'enmity'},
        {'a': 'gongsun_zan', 'b': 'yuan_shao', 'type': 'enmity'}, {'a': 'liu_bei', 'b': 'gongsun_zan', 'type': 'trust'}, {'a': 'lu_bu', 'b': 'dong_zhuo', 'type': 'enmity'}]

sc = {
    'id': '190_gunung', 'name': '190년 군웅할거',
    'description': '동탁이 조정을 쥐자 천하의 제후가 일어섰다. 열두 영웅이 한반도 곳곳에 깃발을 올린다.',
    'year': 190, 'season': 0, 'era': '初平', 'eraStartYear': 190, 'playerFactionId': 'wei',
    'factionNames': {'wei': {'name': '조', 'hanja': '曹'}, 'shu': {'name': '유', 'hanja': '劉'}, 'wu': {'name': '손', 'hanja': '孫'}},
    'factions': fac_res, 'cities': city_out, 'generals': out_gen, 'relations': rel,
    'missions': sc197['missions'],
    'rivals': {'wei': 'dong', 'shu': 'yuanshu', 'wu': 'jing', 'yuan': 'gongsun', 'dong': 'yuan', 'gongsun': 'yuan', 'jing': 'wu', 'ma': 'dong',
               'zhanglu': 'ma', 'yuanshu': 'yuan', 'lu': 'dong', 'yan': 'wu'},
    'factionIntro': {
        'wei': '서울·수원에서 거병한 조조. 땅은 좁지만 하후씨·조씨 일족과 진궁이 곁에 있다.',
        'shu': '충청에 자리 잡은 유비 삼형제. 가진 것은 적지만 인덕으로 사람을 모은다.',
        'wu': '경상 남부의 강동의 호랑이 손견. 아들 손책과 주유가 곧 어른이 된다.',
        'yuan': '평안도를 쥔 명문 원소. 반동탁 연합의 맹주로 인재와 군량이 넘친다.',
        'dong': '함경도에서 조정을 쥔 동탁. 재물과 서량 철기가 있지만 민심을 잃었다.',
        'gongsun': '강원의 백마장군 공손찬. 조운이 곁에 있고 유비와 친하다.',
        'jing': '호남 곡창의 유표. 싸움보다 다스림에 능하다.',
        'ma': '자강도 산악의 서량 군벌 마등과 한수. 아들 마초가 자라고 있다.',
        'zhanglu': '황해도의 오두미도 교주 장로. 땅은 작지만 백성이 따른다.',
        'yuanshu': '대구의 원술. 형 원소를 시기하며 옥새를 꿈꾼다.',
        'lu': '개성의 여포. 동탁을 떠나 홀로 선 천하무적, 장료·고순이 따른다.',
        'yan': '제주의 엄백호. 바다를 끼고 섬을 지킨다.',
    },
    'debuts': debuts,
    'heirs': {'wu': ['sun_ce', 'sun_quan'], 'wei': ['cao_pi'], 'shu': ['liu_shan', 'guan_ping'], 'yuan': ['yuan_tan', 'yuan_shang'], 'ma': ['ma_chao'],
              'jing': ['liu_qi'], 'lu': ['zhang_liao', 'gao_shun'], 'dong': ['li_jue', 'guo_si']},
    'treaties': treaties,
}
json.dump(sc, open(P('data/scenarios/190_gunung.json'), 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print('generals', len(gens), 'placed', Counter(v['faction'] for v in out_gen.values()), 'debuts', len(debuts))
