// 밸런스 수치는 전부 여기에 모은다 (CLAUDE.md 규칙 4).

export const SEASONS = ['봄', '여름', '가을', '겨울'] as const;

export const BALANCE = {
  // 경제 (계절당)
  goldPerCommerce: 0.1, // 상업 × 인구(천명) × 계수
  harvestPerAgriculture: 6, // 가을 수확: 농업 × 인구(천명) × 계수
  foodPerTroop: 0.25, // 병사 1명이 계절마다 먹는 곡식
  woodPerLevel: 400,
  ironPerLevel: 400,
  popGrowth: 0.01, // 민심 100일 때 계절당 인구 증가율

  // 명령 비용
  developGold: 300,
  wallGold: 200,
  wallWood: 1000,
  conscriptGoldPerTroop: 0.1,
  conscriptIronPerTroop: 0.5,
  conscriptMaxPopRatio: 0.1, // 한 번에 인구의 10%까지
  conscriptOrderLossPer1000: 2,
  rewardGold: 300,
  rewardLoyalty: 8,

  // 전투
  winterAttackPenalty: 0.95, // 겨울 보급 난이도 (날씨와 별도)
  summerRainPenalty: 1, // v0.7부터 날씨 시스템으로 대체
  roadAttackModifier: { land: 1, river: 0.8, pass: 0.85, sea: 0.75 } as Record<string, number>,
  mountainDefenseBonus: 1.2,
  fortressWallMultiplier: 1.5,
  neutralLeadership: 50,
  neutralWar: 50,

  // 충성
  defectLoyalty: 35,
  defectAmbition: 60,
  defectChance: 0.25,

  // 날씨 (v0.7): 목표 도시 날씨에 따른 공격력 배율
  weatherAttack: { clear: 1, rain: 0.92, storm: 0.78, typhoon: 0.65, snow: 0.9, blizzard: 0.7, cold: 0.88, drought: 1, fog: 0.95 } as Record<string, number>,
  droughtHarvestLoss: 0.3, // 가뭄 1계절당 가을 수확 감소율

  // 사기·훈련·보급 (v0.8)
  newRecruitTraining: 20,
  newRecruitMorale: 50,
  trainFood: 0.05, // 훈련 시 병사 1명당 곡식
  victoryMorale: 12,
  defeatMorale: 15,
  starvationMorale: 10,
  isolatedPenalty: 0.8, // 본거지와 끊긴 도시에서 출진
  lowSupplyThreshold: 1, // 군량이 1계절치 미만이면 보급 부족

  // 인격 (v0.9)
  refuseBaseObedience: 62, // 복종도가 이보다 낮으면 거부 가능성
  refuseMax: 0.45,
  memoryLimit: 10,
  grudgeRecruitPenalty: 0.2, // 나를 이긴 세력의 등용 제안 수락률 감소

  // 생애 (v1.0)
  deathAgeStart: 52, // 이 나이부터 자연사 확률
  deathAgeDivisor: 1600, // (나이-시작)^2 / 값 = 연간 사망 확률
  battleDeathChance: 0.03, // 공격 실패 시 지휘관 전사 확률
  uprisingBase: 0.25, // 재기 성공 기본 확률
  uprisingMaxGarrison: 9000, // 이 병력 이하인 도시에서만 재기 가능
  uprisingVolunteerRatio: 0.04, // 재기 시 인구 대비 의병

  // 외교 (v0.4)
  truceBase: 0.35,
  allianceBase: 0.2,
  truceTurns: 8, // 2년
  diplomacyGoldPerPercent: 50, // 금 50당 수락률 +1%
  breakTreatyLoyaltyLoss: 6, // 맹약 파기 시 의리 높은 장수 충성 하락
  aiProposalChance: 0.35,

  // AI
  failedAttackAttrition: 0.45, // 공격 실패 시에도 수비 측이 입는 소모 비율
  aiAttackRatio: 0.95,
} as const;
