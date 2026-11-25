"""v3.4 『삼국지연의』 원문 분석 → 없는 장수 추가 + 능력치 미세 조정.

입력
  1) 원문: 120회 본문을 회차별로 담은 JSON {"1": "...", ..., "120": "..."} (간체, 공개 영역 원문)
     예) github.com/hunterhug/china-literary 의 「原文版三国演义」 HTML 120개를 tools/data/extract_novel.py로 변환
  2) 인물 목록(후보 이름·자·생몰년): github.com/wcswcswcs/sgyy data/renwu_process_v1.csv
     — 이름 후보를 찾는 데만 쓰고, 등장 횟수·능력치는 모두 원문에서 직접 센다.
실행: python3 -I tools/data/novel_analysis.py <sgyy.json> <renwu.csv> [--apply]
출력: docs/history/novel-analysis.md (근거표), --apply 시 data/generals.json 갱신
"""
import csv, json, re, sys, os, hashlib, math
from opencc import OpenCC
import hanja
from pypinyin import lazy_pinyin

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
P = lambda *a: os.path.join(ROOT, *a)
t2s, s2t = OpenCC('t2s'), OpenCC('s2t')
novel_path, csv_path = sys.argv[1], sys.argv[2]
APPLY = '--apply' in sys.argv

chap = json.load(open(novel_path, encoding='utf-8'))
CH = [chap[str(i)] for i in range(1, 121)]
# 문장 단위 (회차 번호 유지)
SENTS = [(i + 1, s) for i, t in enumerate(CH) for s in re.split(r'[。！？!?\n；]', t) if s.strip()]

roster = json.load(open(P('data/generals.json'), encoding='utf-8'))
VAR = {'尙': '尚', '豊': '丰'}
def simp(h):
    for a, b in VAR.items(): h = h.replace(a, b)
    s = t2s.convert(h)
    return s.replace('孙干', '孙乾')  # 乾→干 변환 예외
rows = list(csv.DictReader(open(csv_path, encoding='utf-8')))
byname = {}
for r in rows: byname.setdefault(r['名字'], r)

# ── 1. 후보: 원문에 12회 이상 이름이 나오는 남성 인물, 192년 이후까지 생존 (또는 미상)
EXCLUDE = {'文武', '貂蝉', '孙夫人', '马氏', '周公', '普净', '于吉', '管辂', '马相', '孙仲', '管亥', '曹芳', '左慈'}
have = {simp(g['hanja']) for g in roster}
def years(r):
    m = re.match(r'(\d+|？)-(\d+|？)', r['年龄'].replace('?', '？'))
    if not m: return None, None
    b = int(m.group(1)) if m.group(1).isdigit() else None
    d = int(m.group(2)) if m.group(2).isdigit() else None
    return b, d
full = '\n'.join(CH)
cands = []
for r in rows:
    n = r['名字']
    if len(n) < 2 or n in have or n in EXCLUDE or r['性别'] != '男': continue
    b, d = years(r)
    if d is not None and d < 192: continue
    if b is not None and b > 240: continue
    if full.count(n) >= 12: cands.append(n)

# ── 2. 인물별 문장 수집 (이름 + 고유한 자)
people = {simp(g['hanja']): g['id'] for g in roster}
for n in cands: people[n] = None
zi = {}
zcount = {}
for n in people:
    r = byname.get(n)
    z = r['字号'] if r else ''
    if len(z) == 2 and z != n: zcount[z] = zcount.get(z, 0) + 1; zi[n] = z
STOP = {'公明', '子明'}  # 둘 이상 인물이 쓰는 자
def keys(n):
    k = [n]
    z = zi.get(n)
    if z and zcount[z] == 1 and z not in STOP: k.append(z)
    return k

KW = {
    'war': ['斩', '刺', '挺枪', '舞刀', '拍马', '交锋', '大战', '杀', '射', '勇', '猛', '骁', '搦战', '出马'],
    'leadership': ['引兵', '领兵', '引军', '率', '统', '大军', '屯', '布阵', '督', '调兵', '拒住', '守'],
    'intellect': ['计', '谋', '策', '智', '献', '料', '识破', '妙', '算', '诈', '书'],
    'politics': ['治', '政', '民', '安抚', '屯田', '法', '礼', '奏', '仓', '粮', '朝'],
    'charm': ['仁', '德', '义', '爱', '拜', '降', '归', '哭', '服', '敬', '贤'],
}
KILL = re.compile(r'(斩|刺|杀|射|砍)')
feat = {}
for n in people:
    ks = keys(n)
    ss = [(c, s) for c, s in SENTS if any(k in s for k in ks)]
    if not ss: continue
    f = {'n': len(ss), 'first': min(c for c, _ in ss), 'last': max(c for c, _ in ss)}
    for k, words in KW.items():
        f[k] = sum(1 for _, s in ss if any(w in s for w in words)) / len(ss)
    # 무력: 주어로 베고 찌른 문장 − 당한 문장 절반
    subj = vict = 0
    for _, s in ss:
        for k in ks:
            i = s.find(k)
            if i < 0: continue
            m1 = KILL.search(s, i + len(k)); m0 = KILL.search(s[:i])
            if m1: subj += 1
            if m0 and m0.end() >= i - 2: vict += 1
            break
    f['war'] = f['war'] * 0.5 + (subj - 0.5 * vict) / len(ss)
    f['charm'] += 0.002 * min(len(ss), 400) / 4  # 자주 등장 = 명성
    feat[n] = f

STATS = ['leadership', 'war', 'intellect', 'politics', 'charm']
base = [n for n, gid in people.items() if gid and n in feat and feat[n]['n'] >= 15]
def mean_sd(k):
    xs = [feat[n][k] for n in base]
    m = sum(xs) / len(xs)
    return m, math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs)) or 1
MS = {k: mean_sd(k) for k in STATS}
z = lambda n, k: (feat[n][k] - MS[k][0]) / MS[k][1]

gmap = {g['id']: g for g in roster}
# ── 3. 기존 장수 미세 조정: z × 2, 최대 ±4, 등장 문장 수가 적으면 비례 축소
changes = []
for n, gid in people.items():
    if not gid or n not in feat or feat[n]['n'] < 15: continue
    g = gmap[gid]; conf = min(1, feat[n]['n'] / 60)
    d = {}
    for k in STATS:
        dv = int(round(max(-4, min(4, z(n, k) * 2 * conf))))
        if dv: d[k] = dv
    if d: changes.append((gid, g['name'], feat[n]['n'], d))

# ── 4. 새 장수: 기존 장수 능력치 분포에 분위수 대응 → 등장이 적으면 55로 수렴
def quantile_map(k, v):
    xs = sorted(feat[n][k] for n in base)
    q = sum(1 for x in xs if x <= v) / len(xs)
    ys = sorted(gmap[people[n]]['stats'][k] for n in base)
    return ys[min(len(ys) - 1, int(q * len(ys)))]
CHAP_YEAR = [(1, 184), (10, 192), (20, 198), (30, 200), (40, 207), (50, 208), (60, 211), (70, 218), (80, 220), (90, 225), (100, 231), (110, 255), (120, 280)]
def chap_year(c):
    for (c0, y0), (c1, y1) in zip(CHAP_YEAR, CHAP_YEAR[1:]):
        if c <= c1: return y0 + (y1 - y0) * (c - c0) / (c1 - c0)
    return 280
FAC = {'魏': 'wei', '蜀': 'shu', '吴': 'wu', '西晋': 'wei'}
def jitter(s, k):
    return int(hashlib.md5((s + k).encode()).hexdigest()[:6], 16) % 11 - 5
# 관직·역할 기본값 (CSV의 관직·연의 요약에서 낱말로 분류)
ROLE = {
    '환관': {'leadership': 20, 'war': 15, 'intellect': 55, 'politics': 50, 'charm': 28},
    '남만': {'leadership': 55, 'war': 76, 'intellect': 30, 'politics': 20, 'charm': 40},
    '문관': {'leadership': 42, 'war': 30, 'intellect': 70, 'politics': 72, 'charm': 58},
    '무장': {'leadership': 66, 'war': 72, 'intellect': 45, 'politics': 36, 'charm': 48},
    '군벌': {'leadership': 64, 'war': 60, 'intellect': 58, 'politics': 58, 'charm': 62},
}
CIVIL = ['谋士', '主簿', '长史', '尚书', '幕僚', '说客', '侍中', '司徒', '太傅', '军师', '参军', '从事', '功曹', '议郎', '中书', '侍郎', '御史', '光禄', '太常', '司空', '少府', '丞相']
MIL = ['将军', '部将', '大将', '骁将', '猛将', '校尉', '都尉', '先锋', '都督', '护军']
LORD = ['州牧', '刺史', '太守']
EUNUCH_FIX = {'谯周'}  # 요약문 첫머리가 '宦官 황호' 이야기라 잘못 분류되는 예외
def prior(r):
    t = r['官职'] + r['小说'][:200]
    if r['名字'] in EUNUCH_FIX: return ROLE['문관'], '문관'
    if r['小说'].startswith('宦官') or '常侍' in r['官职']: return ROLE['환관'], '환관'
    if r['主效'] == '少数民族': return ROLE['남만'], '남만'
    c = sum(w in t for w in CIVIL); m = sum(w in t for w in MIL)
    if any(w in r['官职'] for w in LORD) and m == 0 and c == 0: return ROLE['군벌'], '군벌'
    if c > m: return ROLE['문관'], '문관'
    if m > c: return ROLE['무장'], '무장'
    return {k: (ROLE['문관'][k] + ROLE['무장'][k]) // 2 for k in STATS}, '문무'
COMPOUND = ['诸葛', '司马', '夏侯', '公孙', '太史', '欧阳', '皇甫', '淳于', '令狐', '毌丘', '上官', '诸葛']

# 연의 대목을 직접 대조해 손으로 고친 인물 (자동 낱말 통계가 일화를 놓치는 경우). 통·무·지·정·매, 근거 회차
OVERRIDE = {
    '曹彰': ((78, 90, 40, 35, 60), '83회 등 — 황수아, 오환 정벌의 맹장'),
    '曹嵩': ((20, 15, 45, 50, 45), '10회 — 조조의 부친, 서주에서 피살'),
    '杨修': ((30, 20, 88, 72, 60), '72회 — 계륵으로 조조의 속뜻을 읽음'),
    '陶谦': ((55, 40, 60, 70, 78), '11~12회 — 서주를 세 번 양보한 온후한 장자'),
    '王允': ((35, 25, 86, 80, 70), '8~9회 — 연환계로 동탁 제거'),
    '皇甫嵩': ((82, 68, 72, 66, 70), '1~2회 — 황건 토벌의 명장'),
    '朱儁': ((78, 65, 66, 60, 62), '1~2회 — 황건 토벌'),
    '卢植': ((80, 55, 78, 72, 80), '1회 — 유비의 스승, 황건 토벌'),
    '杜预': ((88, 50, 88, 82, 72), '120회 — 오 정벌을 이끈 명장'),
    '羊祜': ((86, 55, 84, 88, 92), '120회 — 육항과 신의를 나눈 덕장'),
    '王濬': ((84, 66, 72, 66, 66), '120회 — 누선으로 건업 입성'),
    '司马炎': ((70, 55, 72, 78, 76), '119~120회 — 진 건국'),
    '贾充': ((55, 40, 78, 72, 40), '114회 — 조모 시해를 사주'),
    '蒋干': ((25, 20, 62, 55, 42), '45회 — 주유에게 속아 거짓 편지를 훔침'),
    '黄皓': ((10, 8, 58, 40, 12), '113~115회 — 후주를 그르친 환관'),
    '谯周': ((20, 15, 80, 72, 58), '118회 — 항복을 권한 학자'),
    '孙綝': ((62, 60, 62, 45, 28), '113회 — 전횡하다 정봉에게 참수'),
    '孙峻': ((58, 58, 60, 48, 30), '108~109회 — 제갈각을 죽인 권신'),
    '文钦': ((74, 84, 48, 40, 50), '110~111회 — 회남 반란의 맹장'),
    '公孙渊': ((62, 66, 58, 55, 45), '106회 — 요동에서 자립했다 사마의에게 멸망'),
    '夏侯楙': ((30, 45, 32, 38, 35), '92회 — 부마로 서량을 잃은 무능한 장수'),
    '杨仪': ((50, 30, 78, 84, 38), '91~105회 — 군량·편제를 맡은 장사'),
    '吴班': ((70, 74, 50, 46, 55), '81~95회 — 촉의 부장'),
    '董承': ((55, 58, 50, 52, 62), '20~23회 — 의대조 사건'),
    '王基': ((80, 62, 78, 72, 66), '111~112회 — 제갈탄 토벌'),
    '孙礼': ((76, 72, 62, 58, 60), '95~107회 — 위의 강직한 장수'),
    '曹豹': ((45, 58, 30, 25, 30), '14회 — 장비와 다투다 서주를 잃게 함'),
    '车胄': ((52, 68, 38, 32, 36), '21회 — 관우에게 참수'),
    '蔡阳': ((60, 72, 40, 30, 38), '28회 — 고성에서 관우에게 참수'),
    '淳于琼': ((55, 62, 40, 38, 40), '30회 — 오소에서 술에 취해 패함'),
    '张杨': ((62, 60, 48, 52, 66), '14~19회 — 하내 태수'),
    '刘繇': ((60, 52, 60, 65, 62), '15회 — 양주자사, 손책에게 패함'),
    '杨奉': ((64, 72, 40, 36, 48), '13~17회 — 헌제 호위'),
    '韩暹': ((55, 66, 30, 30, 40), '13~17회 — 백파적 출신'),
    '张济': ((70, 72, 48, 44, 50), '9~13회 — 동탁 부장'),
    '樊稠': ((66, 76, 36, 30, 38), '9~10회 — 동탁 부장'),
    '杨阜': ((55, 45, 80, 76, 66), '64회 — 마초를 몰아낸 꾀'),
    '伊籍': ((30, 25, 76, 76, 78), '34회 — 유비에게 적로마의 흉을 알림'),
    '陈震': ((55, 35, 68, 72, 66), '86~98회 — 촉의 사신'),
    '兀突骨': ((74, 90, 20, 10, 38), '90회 — 등갑군의 왕'),
    '孟优': ((48, 68, 35, 25, 40), '87~89회 — 맹획의 아우'),
    '董荼那': ((60, 72, 30, 22, 40), '87~88회 — 남만 동주'),
    '阿会喃': ((56, 70, 30, 20, 38), '87~88회 — 남만 동주'),
    '杨松': ((18, 15, 55, 40, 12), '64~65회 — 뇌물을 탐한 장로의 모사'),
}
used = set(gmap)
new = []
for n in cands:
    if n not in feat: continue
    f = feat[n]; r = byname[n]
    conf = min(1, f['n'] / 40)
    pr, role = prior(r)
    w = 0.45 * conf  # 원문 낱말 통계의 비중 (최대 45%), 나머지는 관직·역할 기본값
    st = {k: int(max(10, min(92, round(pr[k] * (1 - w) + quantile_map(k, f[k]) * w + jitter(n, k) * 0.6)))) for k in STATS}
    src = '원문 통계'
    if n in OVERRIDE:
        st = dict(zip(STATS, OVERRIDE[n][0])); src = OVERRIDE[n][1]
    b, d = years(r)
    est = b is None
    if b is None: b = int(chap_year(f['first']) - 30) if d is None else min(d - 35, int(chap_year(f['first']) - 25))
    hz = s2t.convert(n)
    py = [x.replace('ü', 'u').replace('v', 'u') for x in lazy_pinyin(n)]
    two = next((c for c in COMPOUND if n.startswith(c)), None)
    gid = (''.join(py[:2]) + '_' + ''.join(py[2:])) if two else (py[0] + '_' + ''.join(py[1:]))
    if gid in used: gid += '_' + str(b)
    used.add(gid)
    persona = {
        'ambition': 45 + jitter(n, 'a') * 3, 'righteousness': 50 + int(round(z(n, 'charm') * 8)) + jitter(n, 'r'),
        'greed': 45 + jitter(n, 'g') * 3, 'pride': 50 + int(round(z(n, 'war') * 6)) + jitter(n, 'p'), 'risk': 50 + int(round(z(n, 'war') * 8)) + jitter(n, 'k'),
    }
    persona = {k: max(5, min(95, v)) for k, v in persona.items()}
    new.append({'id': gid, 'name': hanja.translate(hz, 'substitution'), 'hanja': hz, 'birth': b, 'stats': st, 'persona': persona,
                '_n': f['n'], '_first': f['first'], '_role': role, '_src': src, '_est': est, '_fac': FAC.get(r['主效']), '_death': d})

# ── 5. 근거 문서
L = ['# 『삼국지연의』 원문 분석 (v3.4)', '',
     f'- 원문 120회, 문장 {len(SENTS):,}개를 직접 셌다. 인물 후보 목록만 외부 CSV(이름·자·생몰년)를 썼다.',
     '- 방법: 인물 이름(과 그 사람만 쓰는 자)이 나오는 문장에서 능력 관련 낱말이 함께 나오는 비율을 센 뒤, 기존 장수 평균과 비교한 표준점수(z)로 바꿨다.',
     '  - 무력: 베다·찌르다·쏘다 앞에 이름이 오는 문장(가해) − 뒤에 오는 문장(피해)의 절반 + 무용 낱말',
     '  - 통솔: 군사를 이끌다·거느리다·진을 치다 / 지력: 계책·꾀·헤아리다 / 정치: 다스리다·백성·둔전·조정 / 매력: 인덕·의리·항복해 오다 + 등장 빈도',
     '- 기존 장수: 조정값 = z × 2 (최대 ±4), 등장 문장이 60개 미만이면 비례해서 줄임 → **"미세 조정"**. 본래 능력치(우리가 정한 값)는 그대로 기준으로 남는다.',
     '- 새 장수: 관직·역할(문관·무장·군벌·환관·남만)별 기본값 55~100%에, 원문 낱말 통계를 기존 장수 능력치 분포에 분위수로 대응시킨 값을 최대 45% 섞었다(등장이 적을수록 비중↓). 생년 미상은 첫 등장 회차로 **추정**.',
     f'- 이름난 일화가 있는 {len(OVERRIDE)}명은 연의의 해당 회차를 대조해 손으로 정했다(표의 근거 열).',
     '- 한계: 낱말 세기는 문맥(부정문·비유)을 모른다. 그래서 조정 폭을 작게 묶었다.', '',
     f'## 새로 넣은 인물 {len(new)}명', '', '| 이름 | 한자 | 역할 | 원문 등장 문장 | 첫 등장 | 생년 | 통 | 무 | 지 | 정 | 매 | 근거 |', '|---|---|---|---|---|---|---|---|---|---|---|---|']
for g in sorted(new, key=lambda x: -x['_n']):
    s = g['stats']
    L.append(f"| {g['name']} | {g['hanja']} | {g['_role']} | {g['_n']} | {g['_first']}회 | {g['birth']}{' (추정)' if g['_est'] else ''} | {s['leadership']} | {s['war']} | {s['intellect']} | {s['politics']} | {s['charm']} | {g['_src']} |")
L += ['', f'## 기존 장수 조정 {len(changes)}명', '', '| 장수 | 원문 문장 | 조정 |', '|---|---|---|']
NAMES = {'leadership': '통', 'war': '무', 'intellect': '지', 'politics': '정', 'charm': '매'}
for gid, name, n, d in sorted(changes, key=lambda x: -x[2]):
    L.append(f"| {name} | {n} | {' '.join(f'{NAMES[k]}{v:+d}' for k, v in d.items())} |")
open(P('docs/history/novel-analysis.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('candidates', len(cands), 'new', len(new), 'changes', len(changes))

if APPLY:
    for gid, _, _, d in changes:
        for k, v in d.items(): gmap[gid]['stats'][k] = max(1, min(100, gmap[gid]['stats'][k] + v))
    meta = {}
    for g in new:
        meta[g['id']] = {'fac': g['_fac'], 'death': g['_death'], 'first': g['_first']}
        roster.append({k: v for k, v in g.items() if not k.startswith('_')})
    json.dump(roster, open(P('data/generals.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(meta, open(P('tools/data/novel_new_meta.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('applied')
