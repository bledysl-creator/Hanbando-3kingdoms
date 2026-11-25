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
  /** 도시에 딸린 산성 하나당 수비 보너스 (v1.3) */
  landmarkFortressBonus: 0.06,
  /** 이름난 고개를 넘어 공격할 때 추가 감소 */
  namedPassPenalty: 0.95,
  /** 이름난 나루를 장악하면(공격 측이 나루 인접 도시 보유 시) 도하 감소 완화 */
  fordEase: 1.05,
  /** 도시에 딸린 항구 하나당 상업 수입 보너스 */
  portLandmarkCommerce: 0.08,
  /** 고지대 도시 수비 보너스: 고도 1000m당, 상한 (v1.9) */
  elevDefensePer1000m: 0.1,
  elevDefenseCap: 0.12,
  /** 시장 (v1.7): 곡식 1000석 매입가·매각가(금). 가을엔 싸고 봄엔 비싸다 */
  foodBuyPer1000: 110,
  foodSellPer1000: 45, // 가을에 사서 봄에 팔아도 이득이 거의 없도록
  seasonFoodPrice: [1.2, 1.0, 0.8, 1.1] as number[],
  /** 상업 수치 100일 때 거래가 할인 */
  marketCommerceDiscount: 0.2,
  /** 한 번 거래 상한 (석) */
  tradeMax: 30000,
  /** 귀농: 병사를 고향으로 돌려보내면 인구로 돌아가고 민심이 오른다 */
  disbandOrderPer1000: 1,
  /** 함락한 도시의 곡식 노획: 패배 세력 곡식 × (그 도시 인구 비중) × 계수 */
  plunderRatio: 0.6,
  /** AI가 군량을 사들이는 기준: 곡식 < 병력 × 이 값 */
  aiBuyFoodBelow: 0.6,
  /** AI 징병 조건: 늘어난 병력을 이 계절 수만큼 먹일 곡식 */
  aiConscriptFoodSeasons: 3,
  /** AI 후방 도시에 남기는 최소 병력 (v1.8) */
  aiRearGarrison: 3000,
  /** 공세 집결 목표: 적 도시 병력의 몇 배를 모을지 */
  aiMassFactor: 1.6,
  /** 계책 성공 시 공격 배율 (v1.6) */
  tacticBonus: { fire: 1.3, ambush: 1.25, night: 1.18 } as Record<'fire' | 'ambush' | 'night', number>,
  /** 계책 실패 시 공격 배율 */
  tacticFailPenalty: 0.9,
  /** AI가 계책을 쓰는 최소 성공률 */
  aiTacticMinChance: 0.5,
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
  aiUprisingChance: 0.3, // AI가 매년 재기를 시도할 확률

  // 계략 (v1.1)
  intelValidTurns: 4,
  scoutGold: 100,
  rumorGold: 200,
  discordGold: 300,
  rumorOrder: 15,
  rumorMorale: 10,

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
