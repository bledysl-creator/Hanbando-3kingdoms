// 밸런스 수치는 전부 여기에 모은다 (CLAUDE.md 규칙 4).

export const SEASONS = ['봄', '여름', '가을', '겨울'] as const;

export const BALANCE = {
  // 경제 (계절당)
  goldPerCommerce: 0.1, // 상업 × 인구(천명) × 계수
  harvestPerAgriculture: 6, // 가을 수확: 농업 × 인구(천명) × 계수
  /** v3.3 어업: 항구 도시 인구 1천 명당 계절마다 얻는 곡식 */
  fishPerPort1000: 20,
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
  roadAttackModifier: { land: 1, river: 0.8, pass: 0.75, sea: 0.75 } as Record<string, number>,
  mountainDefenseBonus: 1.2,
  /** 세력 특성 효과 (v2.7) */
  traitEffects: {
    '최강무력': { attack: 0.1 }, '인재': { recruit: 0.1 }, '대군': { conscriptCost: 0.2 },
    '인덕': { rewardLoyalty: 5 }, '곡창': { harvest: 0.05 }, '교역': { market: 0.1 }, '수군': {}, '불안정': {},
  } as Record<string, { attack?: number; recruit?: number; conscriptCost?: number; rewardLoyalty?: number; harvest?: number; market?: number }>,
  /** 세력 특성 설명 (화면 표시용) */
  traitText: {
    '최강무력': '모든 공격 +10%', '인재': '등용 성공률 +10%', '대군': '징병 금 −20%', '인덕': '포상 충성 +5',
    '곡창': '가을 수확 +5%', '교역': '시장 시세 10% 유리', '수군': '상륙전 +10%·전선 건조 −30%', '불안정': '(효과 없음 — 이야기용)',
  } as Record<string, string>,
  /** v3.1 모든 장수 등장 모드: 등장 예정 장수의 최소 나이 */
  allGeneralsMinAge: 18,
  /** 군현 지도 (v3.2): 치소(중심 시·군)가 받는 병력 비율, 시·군 최소 병력 */
  regionSeatTroopShare: 0.4, regionMinTroops: 300,
  /** 군현 지도에서 산불·역병 발생 확률 배율 (도시 수가 많아 전국 빈도를 맞춤) */
  regionEventScale: 0.1,
  /** 군현 지도: AI 병력 기준 배율, 목재·철 산출 배율 (24/345 ≈ 0.07) */
  regionAiTroopScale: 0.15, regionResourceScale: 0.09,
  /** 군현 지도: 치소 함락 시 속현 귀부 (병력 이하·장수 없음일 때 확률, 귀부 병력 유지 비율) */
  regionSubmitMaxTroops: 3000, regionSubmitChance: 0.6, regionSubmitTroopKeep: 0.5,
  /** 신군주 거병 (v3.2): 아무 시·군에서 새 세력을 세울 때 */
  newRulerGold: 3000, newRulerFood: 30000, newRulerWood: 8000, newRulerIron: 8000, newRulerTroops: 3000, newRulerColor: '#d4a72c',
  /** 관직 (v2.4): 태수 정치/이 값 = 계절마다 농업·상업 +1 확률, 정치 70+ 또는 매력 80+ 이면 민심 + */
  governorDevDivisor: 250, governorOrder: 1, governorLoyalty: 5,
  /** 산불 (v2.8): 확률 = 계절 기본 + 산악 + 목재 등급 + 고도 + 가뭄 */
  fireDrySeason: 0.006, fireOtherSeason: 0.001, fireMountain: 0.012, fireWoodLevel: 0.003, fireDrought: 0.05,
  fireTurns: 2, firePopLoss: 0.01, fireOrderLoss: 3, fireAgriLoss: 2, fireSpread: 0.2, fireWoodPenalty: 0.5,
  /** 진화: 금 비용 */
  extinguishGold: 300,
  /** 역병 (v2.3): 발생 확률 = 계절 기본 + 인구 10만당 + 큰비 − 민심 보호 */
  epidemicSummer: 0.025, epidemicOther: 0.004, epidemicDensity: 0.015, epidemicFlood: 0.03, epidemicOrderGuard: 0.02,
  epidemicTurns: 3, epidemicPopLoss: 0.03, epidemicTroopLoss: 0.03, epidemicOrderLoss: 4, epidemicSpread: 0.15,
  /** 구휼: 인구 1000명당 곡식, 민심 상승 */
  reliefFoodPer1000: 100, reliefOrder: 8,
  /** 귀순 (v2.1): 도시 이 수 이하, 이웃 강국이 전체 도시의 이 비율 이상, 병력이 강국의 이 비율 이하일 때 해마다 확률 */
  surrenderMaxCities: 3, surrenderDominance: 0.4, surrenderTroopRatio: 0.3, surrenderChance: 0.35,
  /** 수군 (v2.0) */
  shipWood: 400, shipGold: 40, shipsPerBuild: 10, maxShipsPerCity: 60,
  /** 전선 1척당 상륙 작전 공격 보정, 상한 */
  shipAttackPer: 0.01, shipAttackCap: 0.35,
  /** 수비 항구의 전선 1척당 해상 방어, 상한 */
  shipDefensePer: 0.007, shipDefenseCap: 0.25,
  /** '수군' 특성 세력의 해상 공격 추가 보정 */
  navalTraitBonus: 0.1,
  /** 해상 공격 실패 시 전선 손실 비율 */
  shipLossOnFail: 0.2,
  /** 시작 전선: 수군 특성 세력 항구 / 그 외 항구 */
  startShipsNaval: 30, startShipsPort: 10,
  /** AI가 항구마다 갖추려는 전선 수 */
  aiShipTarget: 30,
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
  /** v3.6 포위 대응: AI가 플레이어 도시를 치면 한 계절 포위 → 플레이어가 대응을 고른다 */
  siegeChoice: true,
  /** 농성: 수비 배율, 성 밖 농경지 손실 */
  siegeHoldDefense: 1.15,
  siegeHoldAgriLoss: 2,
  /** 협공: 원군이 적의 배후를 쳐 적 공격력 배율 */
  siegePincerAttackMul: 0.9,
  /** 출성 요격: 성벽 없이 싸우되 수비 장수 무력에 따라 기세(무력 50 = 0, 100 = +20%), 이기면 적 손실 ×1.5·아군 손실 ×0.6 */
  siegeSortiePerWar: 0.004,
  siegeSortieRout: 1.5,
  siegeSortieSpare: 0.6,
  /** 청야 철수: 함께 옮기는 인구 비율, 남기고 떠나는 도시의 농업·상업 손실 */
  siegeEvacPop: 0.5,
  siegeEvacAgri: 15,
  siegeEvacCommerce: 10,
  /** 화친 요청: 예물 금 = 적 병력 × 이 값 (최소 siegeParleyMinGold), 실패하면 예물 절반을 잃고 사기 저하 */
  siegeParleyGoldPerTroop: 0.12,
  /** 화친으로 맺는 휴전 기간 (계절) — 외교 휴전보다 짧다 */
  siegeParleyTruceTurns: 4,
  /** 화친 성공률 상한 */
  siegeParleyMax: 0.6,
  /** 화친을 받아 준 세력은 휴전이 끝난 뒤에도 이 계절 수만큼 다시 화친을 받지 않는다 */
  siegeParleyCooldown: 8,
  /** AI가 플레이어 성을 노릴 때 승산을 이 값으로 나눠 신중하게 본다 (농성·협공 대비) */
  siegeAiCaution: 1.25,
  siegeParleyMinGold: 300,
  siegeParleyFailMorale: 5,
  /** 대응별 예상 결과를 낼 때 돌려 보는 전투 수 */
  siegeForecastSamples: 120,
  /** 함락한 도시의 곡식 노획: 패배 세력 곡식 × (그 도시 인구 비중) × 계수 */
  plunderRatio: 0.6,
  /** AI가 군량을 사들이는 기준: 곡식 < 병력 × 이 값 */
  aiBuyFoodBelow: 0.6,
  /** AI 징병 조건: 늘어난 병력을 이 계절 수만큼 먹일 곡식 */
  aiConscriptFoodSeasons: 3,
  /** v3.3 AI가 군량 계획에 반영하는 예상 수확 비율 (가뭄·전란 대비 할인) */
  aiHarvestTrust: 0.8,
  /** v3.3 한 해 군량이 필요량의 이 비율보다 적으면 AI가 병력을 줄인다 */
  aiFoodDeficitDisband: 0.75,
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
  /** v3.4 태수 파견 AI 점수 (등용 45·공세 집결 44보다 낮고 내정보다 높음) */
  aiDispatchScore: 39,
  /** v3.4 반란·독립: 충성 이 값 미만 + 야망 이상인 장수가 군주와 떨어진 도시에 있을 때, 해마다 확률 */
  rebelLoyaltyBelow: 40, rebelAmbitionMin: 65, rebelBase: 0.04, rebelMax: 0.35, rebelBigShare: 0.33, rebelBigMul: 1.6,
  /** v3.4 도시 장수 상한을 이만큼 넘으면 이웃으로 분산 */
  aiCrowdSlack: 2,
  /** v3.3 배수진: 도시 비율이 이 값 이하인 세력의 수비 보너스 */
  lastStandCityShare: 0.13, lastStandDefense: 0.4,
  /** v3.3 합종: 도시 비율이 이 값 이상이면 패자, 나머지 세력 사이 휴전 수락 + */
  hegemonShare: 0.33, coalitionAccept: 0.25,

  // AI
  failedAttackAttrition: 0.45, // 공격 실패 시에도 수비 측이 입는 소모 비율
  aiAttackRatio: 0.95,
} as const;
