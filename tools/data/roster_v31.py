"""v3.1 장수 확충: 삼국지 인물 추가 (능력치·성향은 이 프로젝트가 직접 정한 값 — 상용 게임 수치 아님).
생년은 정사 기준 대략값, 불확실하면 추정 (docs/history/generals-v31.md).
사용: python3 -I tools/data/roster_v31.py  (data/generals.json, data/scenarios/197_sabun.json 갱신, 이미 있는 id는 건너뜀)
"""
import json, os, hashlib
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 성향 원형: 야망·의리·탐욕·자존심·위험감수
ARCH = {
    'L': (30, 88, 30, 55, 45),  # 충직
    'A': (85, 35, 60, 75, 70),  # 야심
    'G': (55, 30, 85, 50, 55),  # 탐욕
    'P': (60, 60, 45, 88, 60),  # 자존심
    'B': (50, 62, 45, 55, 50),  # 무난
    'S': (40, 66, 35, 62, 30),  # 신중한 책사
    'W': (50, 66, 40, 66, 82),  # 용맹
}

# id, 이름, 한자, 생년, 통솔, 무력, 지력, 정치, 매력, 성향, 197 소속(wei/lu/shu/wu/None), 도시, 등장연도(없으면 None)
R = [
 # ── 위(魏) 197년 소속 ──
 ('cao_hong','조홍','曹洪',169, 76,78,48,52,58,'G','wei','kaesong',None),
 ('cao_chun','조순','曹純',170, 78,74,58,55,62,'L','wei','pyongyang',None),
 ('yue_jin','악진','樂進',165, 80,84,50,45,55,'W','wei','haeju',None),
 ('li_dian','이전','李典',174, 78,74,72,68,70,'L','wei','anju',None),
 ('yu_jin','우금','于禁',160, 84,76,64,58,58,'P','wei','uiju',None),
 ('xu_huang','서황','徐晃',169, 88,88,68,52,66,'L','wei','kaesong',None),
 ('cheng_yu','정욱','程昱',141, 72,40,90,80,60,'S','wei','pyongyang',None),
 ('liu_ye','유엽','劉曄',172, 55,30,90,76,66,'S','wei','haeju',None),
 ('man_chong','만총','滿寵',170, 76,58,82,84,68,'L','wei','ganggye',None),
 ('chen_qun','진군','陳群',175, 40,24,84,92,74,'S','wei','pyongyang',None),
 ('zhong_yao','종요','鍾繇',151, 52,30,82,90,72,'S','wei','anju',None),
 ('li_tong','이통','李通',168, 74,80,50,50,60,'L','wei','uiju',None),
 ('cao_xiu','조휴','曹休',174, 80,72,64,58,66,'B','wei','pyongyang',198),
 ('cao_zhen','조진','曹眞',180, 84,76,66,62,70,'B','wei','pyongyang',198),
 ('xiahou_shang','하후상','夏侯尙',182, 70,62,60,58,66,'B','wei','kaesong',200),
 ('jia_kui','가규','賈逵',174, 70,48,80,82,70,'L','wei','haeju',203),
 ('hao_zhao','학소','郝昭',185, 82,68,70,52,58,'L','wei','uiju',207),
 ('guo_huai','곽회','郭淮',187, 86,72,76,72,72,'L','wei','kaesong',210),
 ('cao_shuang','조상','曹爽',200, 50,48,40,46,52,'G','wei','pyongyang',220),
 ('sima_shi','사마사','司馬師',208, 88,62,88,84,76,'A',None,'haeju',225),
 ('sima_zhao','사마소','司馬昭',211, 86,60,86,86,74,'A',None,'haeju',228),
 ('zhong_hui','종회','鍾會',225, 82,58,93,80,70,'A',None,'anju',242),
 ('guanqiu_jian','관구검','毌丘儉',200, 84,74,72,62,68,'P','wei','uiju',218),
 ('zhuge_dan','제갈탄','諸葛誕',200, 80,68,74,70,74,'P','wei','haeju',218),
 ('wen_yang','문앙','文鴦',238, 74,92,48,30,58,'W',None,'anju',254),
 ('chen_tai','진태','陳泰',200, 84,64,80,78,72,'L','wei','kaesong',218),
 ('xiahou_ba','하후패','夏侯霸',195, 80,82,58,50,60,'B','wei','haeju',212),
 ('wang_shuang','왕쌍','王雙',190, 64,88,26,20,40,'W','wei','ganggye',208),
 # ── 여(呂) ──
 ('cao_xing','조성','曹性',165, 58,74,34,26,40,'W','lu','hamhung',None),
 ('hao_meng','학맹','郝萌',162, 54,66,30,28,30,'A','lu','wonsan',None),
 ('cheng_lian','성렴','成廉',165, 56,74,32,24,38,'W','lu','hyesan',None),
 ('lu_lingqi','여영기','呂玲綺',185, 66,84,40,30,62,'W','lu','hamhung',None),
 # ── 촉(蜀) ──
 ('mi_fang','미방','糜芳',168, 56,60,38,48,44,'G','shu','jeonju',None),
 ('zhou_cang','주창','周倉',170, 52,82,30,24,56,'L','shu','hanyang',None),
 ('chen_dao','진도','陳到',170, 78,80,58,48,62,'L','shu','suwon',None),
 ('liu_feng','유봉','劉封',192, 70,78,40,36,54,'P','shu','hanyang',207),
 ('guan_xing','관흥','關興',196, 74,84,58,46,66,'L','shu','hanyang',212),
 ('wang_ping','왕평','王平',190, 82,72,70,58,60,'L',None,'cheongju',208),
 ('ma_liang','마량','馬良',187, 60,32,88,84,82,'S',None,'gwangju',205),
 ('zhang_yi','장익','張翼',190, 74,72,64,58,58,'L','shu','gongju',208),
 ('jiang_wan','장완','蔣琬',190, 50,30,84,90,80,'L','shu','hanyang',210),
 ('fei_yi','비의','費禕',195, 54,32,84,88,84,'L','shu','hanyang',213),
 ('dong_yun','동윤','董允',195, 40,24,80,86,76,'L','shu','hanyang',213),
 ('liao_hua','요화','廖化',175, 70,74,58,50,62,'L',None,'naju',None),
 ('ma_dai','마대','馬岱',180, 76,82,54,44,64,'L',None,'ganggye',None),
 ('liu_shan','유선','劉禪',207, 30,20,40,52,70,'B','shu','hanyang',223),
 # ── 오(吳) ──
 ('sun_ce','손책','孫策',175, 94,94,70,72,95,'A','wu','gyeongju',None),
 ('zhou_tai','주태','周泰',165, 80,90,50,40,58,'L','wu','busan',None),
 ('jiang_qin','장흠','蔣欽',168, 76,80,62,58,62,'L','wu','daegu',None),
 ('dong_xi','동습','董襲',168, 72,82,42,38,58,'W','wu','busan',None),
 ('ling_cao','능조','淩操',160, 70,78,40,36,52,'W','wu','gangneung',None),
 ('chen_wu','진무','陳武',172, 72,80,46,40,60,'L','wu','jinju',None),
 ('lu_fan','여범','呂範',160, 72,58,72,72,66,'L','wu','gyeongju',None),
 ('zhuge_jin','제갈근','諸葛瑾',174, 66,34,82,86,88,'L','wu','gyeongju',200),
 ('gu_yong','고옹','顧雍',168, 36,20,82,92,78,'S','wu','gyeongju',None),
 ('yu_fan','우번','虞翻',164, 46,40,86,72,52,'P','wu','daegu',None),
 ('zhang_hong','장굉','張紘',153, 32,20,86,88,76,'S','wu','gyeongju',None),
 ('xu_sheng','서성','徐盛',177, 84,80,70,56,64,'L','wu','busan',198),
 ('ding_feng','정봉','丁奉',190, 80,82,62,46,60,'W','wu','busan',208),
 ('zhu_huan','주환','朱桓',177, 84,80,66,52,62,'P','wu','jinju',200),
 ('ling_tong','능통','淩統',189, 76,84,52,44,66,'L','wu','gangneung',205),
 ('kan_ze','감택','闞澤',170, 44,24,84,80,70,'S','wu','gyeongju',203),
 ('bu_zhi','보즐','步騭',175, 70,42,80,80,70,'S','wu','daegu',203),
 ('pan_zhang','반장','潘璋',175, 74,80,44,40,42,'G','wu','jinju',198),
 ('zhu_ran','주연','朱然',182, 82,70,72,62,68,'L','wu','gyeongju',200),
 ('quan_cong','전종','全琮',198, 76,66,64,66,64,'B','wu','busan',215),
 ('he_qi','하제','賀齊',170, 78,70,64,62,62,'L','wu','gangneung',200),
 ('lu_kang','육항','陸抗',226, 92,68,90,84,80,'L','wu','busan',242),
 ('zhuge_ke','제갈각','諸葛恪',203, 82,52,88,74,70,'A','wu','gyeongju',220),
 ('sun_shao','손소','孫韶',188, 74,70,58,50,58,'L','wu','gangneung',205),
 ('lu_dai','여대','呂岱',161, 76,64,72,72,66,'L','wu','jinju',None),
 # ── 재야: 원소 계열 ──
 ('yuan_shao','원소','袁紹',154, 82,68,72,74,90,'P',None,'anju',None),
 ('yan_liang','안량','顔良',160, 80,93,36,30,52,'W',None,'anju',None),
 ('wen_chou','문추','文醜',160, 78,92,30,26,50,'W',None,'uiju',None),
 ('zhang_he','장합','張郃',167, 90,88,72,58,68,'B',None,'haeju',None),
 ('gao_lan','고람','高覽',165, 76,80,46,40,50,'B',None,'haeju',None),
 ('tian_feng','전풍','田豊',155, 70,30,94,80,52,'P',None,'uiju',None),
 ('ju_shou','저수','沮授',160, 82,36,92,82,70,'L',None,'anju',None),
 ('shen_pei','심배','審配',160, 76,48,80,74,56,'L',None,'anju',None),
 ('feng_ji','봉기','逢紀',160, 40,30,78,66,40,'A',None,'uiju',None),
 ('xu_you','허유','許攸',160, 30,24,84,70,30,'G',None,'haeju',None),
 ('guo_tu','곽도','郭圖',160, 46,30,76,62,40,'A',None,'anju',None),
 ('yuan_tan','원담','袁譚',175, 70,68,48,46,56,'A',None,'uiju',None),
 ('yuan_shang','원상','袁尙',179, 66,70,44,44,72,'A',None,'anju',None),
 ('qu_yi','국의','麴義',160, 84,82,52,32,40,'P',None,'uiju',None),
 # ── 재야: 원술 계열 ──
 ('yuan_shu','원술','袁術',155, 58,62,52,48,50,'A',None,'daegu',None),
 ('ji_ling','기령','紀靈',160, 72,86,38,32,48,'W',None,'daegu',None),
 ('zhang_xun','장훈','張勳',160, 62,64,42,38,40,'B',None,'gyeongju',None),
 ('lei_bo','뇌박','雷薄',160, 50,62,30,28,30,'G',None,'gyeongju',None),
 ('yang_hong','양홍','楊弘',160, 30,20,72,70,48,'S',None,'daegu',None),
 # ── 재야: 유표 계열 ──
 ('liu_biao','유표','劉表',142, 60,40,72,82,86,'S',None,'gwangju',None),
 ('cai_mao','채모','蔡瑁',165, 74,62,66,62,46,'G',None,'naju',None),
 ('kuai_yue','괴월','蒯越',160, 52,30,88,82,66,'S',None,'gwangju',None),
 ('kuai_liang','괴량','蒯良',160, 46,26,86,84,64,'S',None,'gwangju',None),
 ('huang_zu','황조','黃祖',150, 72,68,48,46,40,'P',None,'naju',None),
 ('wen_pin','문빙','文聘',170, 82,78,64,60,68,'L',None,'gwangju',None),
 ('liu_qi','유기','劉琦',180, 50,40,60,62,72,'B',None,'naju',None),
 ('zhang_yun','장윤','張允',165, 64,60,48,46,40,'G',None,'naju',None),
 # ── 재야: 유장·익주 계열 ──
 ('liu_zhang','유장','劉璋',162, 40,30,48,60,64,'B',None,'jinju',None),
 ('zhang_ren','장임','張任',165, 88,86,78,52,66,'L',None,'jinju',None),
 ('yan_yan','엄안','嚴顔',150, 80,84,62,52,68,'L',None,'jinju',None),
 ('huang_quan','황권','黃權',170, 82,56,82,78,72,'L',None,'busan',None),
 ('fa_zheng','법정','法正',176, 76,46,95,78,62,'A',None,'jinju',None),
 ('zhang_song','장송','張松',170, 30,20,88,82,40,'A',None,'busan',None),
 ('li_yan','이엄','李嚴',170, 82,74,80,82,62,'A',None,'jinju',None),
 ('wu_yi','오의','吳懿',170, 78,72,66,62,64,'B',None,'busan',None),
 ('meng_da','맹달','孟達',170, 72,72,70,58,54,'A',None,'jinju',None),
 # ── 재야: 서량·한중 ──
 ('ma_teng','마등','馬騰',156, 82,84,48,52,78,'L',None,'ganggye',None),
 ('ma_chao','마초','馬超',176, 86,97,44,30,82,'P',None,'ganggye',None),
 ('pang_de','방덕','龐德',170, 82,92,62,44,66,'L',None,'hyesan',None),
 ('han_sui','한수','韓遂',145, 76,70,70,64,64,'A',None,'hyesan',None),
 ('zhang_lu','장로','張魯',165, 60,40,74,82,80,'S',None,'chuncheon',None),
 ('yan_pu','염포','閻圃',165, 44,24,82,80,64,'S',None,'chuncheon',None),
 ('zhang_wei','장위','張衛',170, 66,70,40,40,40,'P',None,'chuncheon',None),
 # ── 재야: 그 밖의 군웅·인물 ──
 ('gongsun_zan','공손찬','公孫瓚',155, 82,84,50,44,72,'P',None,'gangneung',None),
 ('zhang_xiu','장수','張繡',165, 78,80,54,46,64,'B',None,'cheongju',None),
 ('jia_xu','가후','賈詡',147, 72,40,96,84,58,'S',None,'cheongju',None),
 ('li_jue','이각','李傕',150, 70,76,40,20,24,'G',None,'chongjin',None),
 ('guo_si','곽사','郭汜',150, 66,74,30,18,22,'G',None,'chongjin',None),
 ('xu_rong','서영','徐榮',160, 82,78,64,40,48,'B',None,'chongjin',None),
 ('kong_rong','공융','孔融',153, 36,24,80,72,86,'P',None,'suwon',None),
 ('wang_lang','왕랑','王朗',150, 50,30,76,82,68,'S',None,'gongju',None),
 ('hua_xin','화흠','華歆',157, 40,24,80,84,72,'S',None,'gongju',None),
 ('shi_xie','사섭','士燮',137, 48,30,72,86,82,'S',None,'jeju',None),
 ('chen_deng','진등','陳登',163, 80,58,84,82,74,'B',None,'suwon',None),
 ('zang_hong','장홍','臧洪',160, 70,58,72,70,78,'L',None,'cheongju',None),
 ('meng_huo','맹획','孟獲',190, 76,86,40,48,74,'P',None,'jeju',210),
 ('hua_tuo','화타','華佗',145, 20,30,88,52,86,'L',None,'gongju',None),
 ('zuo_ci','좌자','左慈',156, 30,40,92,40,80,'B',None,'hyesan',None),
 ('sima_hui','사마휘','司馬徽',173, 30,20,90,70,88,'S',None,'gwangju',None),
 ('cui_yan','최염','崔琰',163, 46,30,76,82,84,'L',None,'haeju',None),
 ('zhang_zhi','장의','張嶷',200, 78,76,66,58,64,'L',None,'naju',220),
 ('deng_zhi','등지','鄧芝',178, 66,52,80,82,78,'L',None,'gongju',203),
 ('xin_pi','신비','辛毗',170, 40,24,82,78,66,'S',None,'anju',None),
 ('xin_ping','신평','辛評',165, 36,24,74,72,56,'S',None,'anju',None),
]

def jitter(key, i):
    h = hashlib.md5(f'{key}:{i}'.encode()).digest()[0]
    return (h % 17) - 8

def main():
    gp = os.path.join(ROOT, 'data/generals.json'); sp = os.path.join(ROOT, 'data/scenarios/197_sabun.json')
    gens = json.load(open(gp)); sc = json.load(open(sp))
    have = {g['id'] for g in gens}
    cities = {c['id'] for c in json.load(open(os.path.join(ROOT, 'data/cities.json')))}
    added = 0
    for (gid, name, hanja, birth, L, W, I, P, C, arch, fac, city, debut) in R:
        if gid in have:
            continue
        assert city in cities, (gid, city)
        base = ARCH[arch]
        persona = dict(zip(['ambition', 'righteousness', 'greed', 'pride', 'risk'], [max(5, min(98, v + jitter(gid, k))) for k, v in enumerate(base)]))
        gens.append({'id': gid, 'name': name, 'hanja': hanja, 'birth': birth,
                     'stats': {'leadership': L, 'war': W, 'intellect': I, 'politics': P, 'charm': C}, 'persona': persona})
        if debut:
            sc.setdefault('debuts', {})[gid] = {'year': debut, 'city': city, 'faction': fac}
        else:
            loyalty = 75 if fac else 0
            sc['generals'][gid] = {'faction': fac, 'city': city, 'loyalty': loyalty}
        added += 1
    # 손책은 손권의 형 — 신뢰 관계, 오의 후계 1순위
    rel = sc.setdefault('relations', [])
    if not any(r['a'] == 'sun_ce' or r['b'] == 'sun_ce' for r in rel):
        rel.append({'a': 'sun_quan', 'b': 'sun_ce', 'type': 'trust'})
        rel.append({'a': 'sun_ce', 'b': 'zhou_yu', 'type': 'sworn'})
    sc.setdefault('heirs', {})['wu'] = ['sun_ce'] + [h for h in sc['heirs'].get('wu', []) if h != 'sun_ce']
    sc['heirs']['shu'] = ['liu_shan'] + [h for h in sc['heirs'].get('shu', []) if h != 'liu_shan']
    json.dump(gens, open(gp, 'w'), ensure_ascii=False, indent=1)
    json.dump(sc, open(sp, 'w'), ensure_ascii=False, indent=2)
    print('added', added, 'total', len(gens))

if __name__ == '__main__':
    main()
