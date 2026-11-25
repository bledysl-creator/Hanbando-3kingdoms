// 한국어 조사 자동 교정 (v2.6): "조조이(가)" → "조조가", "한양을(를)" → "한양을".
// 받침 판단은 앞 글자가 한글일 때만 하고, 한글이 아니면 원문을 그대로 둔다.
const PAIRS: [string, string, string][] = [
  ['이(가)', '이', '가'], ['을(를)', '을', '를'], ['은(는)', '은', '는'], ['과(와)', '과', '와'], ['아(야)', '아', '야'],
];

function batchim(ch: string): number | null {
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  return code % 28; // 0 = 받침 없음, 8 = ㄹ
}

export function fixJosa(text: string): string {
  let out = text;
  for (const [pat, withB, without] of PAIRS) {
    out = out.split(pat).reduce((acc, part, i) => {
      if (i === 0) return part;
      const b = batchim(acc.slice(-1));
      return acc + (b === null ? pat : b ? withB : without) + part;
    });
  }
  // (으)로: 받침 없거나 ㄹ 받침이면 '로'
  out = out.split('(으)로').reduce((acc, part, i) => {
    if (i === 0) return part;
    const b = batchim(acc.slice(-1));
    return acc + (b === null ? '(으)로' : b === 0 || b === 8 ? '로' : '으로') + part;
  });
  return out;
}
