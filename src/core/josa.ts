// 한국어 조사 자동 교정 (v2.6): "조조이(가)" → "조조가", "한양을(를)" → "한양을".
// 받침 판단은 앞 글자가 한글일 때만 하고, 한글이 아니면 원문을 그대로 둔다.
const PAIRS: [string, string, string][] = [
  ['이(가)', '이', '가'], ['을(를)', '을', '를'], ['은(는)', '은', '는'], ['과(와)', '과', '와'], ['아(야)', '아', '야'],
];

/** 숫자로 끝나면 읽는 소리로 받침을 정한다: 1·7·8(일·칠·팔)=ㄹ, 2·4·5·9=없음, 3=ㅁ, 6=ㄱ, 0(십·백·천·만)=있음 (v4.2.1) */
const DIGIT_BATCHIM: Record<string, number> = { '0': 1, '1': 8, '2': 0, '3': 16, '4': 0, '5': 0, '6': 1, '7': 8, '8': 8, '9': 0 };

function batchim(ch: string): number | null {
  if (ch in DIGIT_BATCHIM) return DIGIT_BATCHIM[ch];
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  return code % 28; // 0 = 받침 없음, 8 = ㄹ
}

/** 조사 앞 글자. "촉(蜀)이(가)"처럼 괄호 설명이 붙어 있으면 괄호 앞 글자로 판단한다 (v4.2.1) */
function lastChar(acc: string): string {
  if (acc.endsWith(')')) {
    const open = acc.lastIndexOf('(');
    if (open > 0) return acc.charAt(open - 1);
  }
  return acc.slice(-1);
}

export function fixJosa(text: string): string {
  let out = text;
  for (const [pat, withB, without] of PAIRS) {
    out = out.split(pat).reduce((acc, part, i) => {
      if (i === 0) return part;
      const b = batchim(lastChar(acc));
      return acc + (b === null ? pat : b ? withB : without) + part;
    });
  }
  // (으)로: 받침 없거나 ㄹ 받침이면 '로'
  out = out.split('(으)로').reduce((acc, part, i) => {
    if (i === 0) return part;
    const b = batchim(lastChar(acc));
    return acc + (b === null ? '(으)로' : b === 0 || b === 8 ? '로' : '으로') + part;
  });
  return out;
}
