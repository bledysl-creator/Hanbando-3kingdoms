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
  /** v4.2.1 맡기기는 금이 이만큼 아래로 내려가면 금 드는 명령을 멈춘다 */
  delegateGoldKeep: 1500,
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
  /** v3.8 군현 지도: 장수 없는 후방 현의 남는 병력(후방 수비 3,000×0.15 초과분)의 이 비율이 계절마다 전선 쪽 이웃으로 이동 */
  regionMuster: true,
  regionMusterShare: 0.8,
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
  /** v3.7 약소 세력 AI: 가장 강한 세력 국력의 이 비율 미만이면 출진할 때 접경 위협의 이 몫만큼 성에 남긴다 (보통 0.25) */
  aiWeakShare: 0.7,
  aiWeakThreatKeep: 1,
  /** 약소 세력은 이 배만큼 더 큰 승산이 있어야 출진 */
  aiWeakAttackMul: 1.3,
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

  // v3.9 냉병기 전투: 병종 편성·붕괴와 추격·일기토·패잔병 (docs/balance/battle-v3.9.md)
  /** 말 산지 (추정): 관서 의주, 관북 함흥·청진·혜산, 제주 — 이 도시(또는 관할 시·군)를 가진 세력만 기병 편성 */
  horseCities: ['uiju', 'hamhung', 'chongjin', 'hyesan', 'jeju'] as string[],
  formation: {
    infantryWall: 1.1, infantryRough: 1.1, infantryPursuit: 0.6,
    archerRiver: 1.15, archerWet: 0.8, archerWall: 0.95, archerOwnLoss: 0.8, archerPursuit: 0.8,
    cavalryOpen: 1.2, cavalryRough: 0.75, cavalryRiver: 0.85, cavalryWall: 0.85, cavalrySnow: 0.9, cavalryPursuit: 2,
    /** v4.1 창병: 험지 +5%, 추격 약함 / 전차병: 평지 돌격 최강, 험지·강·성벽·진흙(비·눈)에 약함 */
    spearRough: 1.05, spearPursuit: 0.6,
    chariotOpen: 1.35, chariotRough: 0.6, chariotRiver: 0.7, chariotWall: 0.75, chariotMud: 0.8, chariotPursuit: 1.5,
    /** 최강무력 특성 세력(여포·마등·공손찬)의 기병 돌격 추가 */
    cavalryTraitBonus: 0.1,
    /** 이 성벽 이상(또는 산성·요새)이면 '큰 성': 보병 +, 기병·궁노 − */
    wallHigh: 70,
  },
  /** 맞붙는 단계(접전) 손실률: 이긴 쪽 = clash/전력비, 진 쪽 = clash×√전력비 (상한 clashLoserCap) */
  clashLoss: 0.2, clashLoserCap: 0.4, clashWinnerMin: 0.02,
  /** 성벽을 기어오르는 공성은 이겨도 피를 많이 흘린다: 공격 측 접전 손실 × (1 + 성벽/assaultWallDiv) */
  assaultWallDiv: 100,
  /** 진 쪽이 무너져 달아날 때 남은 병력에서 추격으로 잃는 비율 (기본). 산·고개는 추격이 어렵다 */
  pursuitLoss: 0.18, pursuitRoughMul: 0.7, pursuitRatioCap: 1.6,
  /** 성 안에서 싸운 수비군은 접전 손실이 줄어든다 (성벽 50 이상) */
  wallClashShield: 0.8,
  /** 함락된 성의 살아남은 수비병 중 이웃 아군 성으로 빠져나가는 비율 (나머지는 흩어짐·투항) */
  routRetreatShare: 0.6,
  /** 흩어진 패잔병 중 이긴 쪽에 투항해 편입되는 비율 */
  routSurrenderShare: 0.15,
  /** 일기토: 두 지휘관 무력이 모두 기준 이상이면 확률적으로 벌어진다 */
  duelMinWar: 78, duelChance: 0.2, duelWinMul: 1.08, duelLoseMul: 0.85, duelSlainChance: 0.1, duelSpread: 7,

  // v4.0 전투 확률·지형·수비 편성·책사·수련·산물·포로 (docs/balance/v4.0.md)
  /** 사기 배율 = 0.5 + 0.5 × (사기/moraleRef)^moraleExp (상한 moraleCap). 사기 routMorale 미만이면 오합지졸 ×routMoraleMul */
  moraleRef: 70, moraleExp: 0.8, moraleCap: 1.25, routMorale: 30, routMoraleMul: 0.7,
  /** 전장의 변수: 이 확률로 아무도 예상 못 한 일이 벌어진다 */
  fortuneChance: 0.12,
  /** 산악도: 기병은 산악도 reliefCavalryFrom 이상부터 1점당 −0.6%, 대군 정면 제약 (병력비)^(−산악도/frontageDiv) */
  reliefCavalryFrom: 25, reliefCavalryPer: 0.006, frontageFrom: 30, frontageDiv: 500, reliefAmbushDiv: 300,
  /** 분지(펀치볼): 능선이 둘러싸 수비 + basinDefense×분지도, 함락 때 빠져나가기 어려움 */
  basinFrom: 0.66, basinDefense: 0.08, basinTrap: 0.5,
  /** 공격 편성 × 수비 편성 상성 (공격 배율). 성벽 위 궁노는 돌진하는 기병에게 특히 매섭다 */
  counter: {
    infantry: { infantry: 1, spear: 1, archer: 0.95, cavalry: 1.05, chariot: 1.1 },
    spear: { infantry: 1, spear: 1, archer: 0.95, cavalry: 1.15, chariot: 1.2 },
    archer: { infantry: 1.1, spear: 1.1, archer: 1, cavalry: 0.9, chariot: 0.95 },
    cavalry: { infantry: 0.95, spear: 0.75, archer: 1.1, cavalry: 1, chariot: 1.05 },
    chariot: { infantry: 1.05, spear: 0.7, archer: 1.05, cavalry: 0.95, chariot: 1 },
  } as Record<string, Record<string, number>>,
  wallArcherVsCavalry: 0.85,
  /** 군마: 기병 10명당 말 1필, 말 산지 등급당 계절마다 horsesPerLevel필, 시작 시 등급당 horsesStartPerLevel필 */
  horsePerTroop: 0.1, horsesPerLevel: 60, horsesStartPerLevel: 600,
  /** v4.1 군사 편제: 병사 1명을 그 병종으로 바꾸는 데 드는 자원, 편제를 바꾼 비율 × trainDrop 만큼 훈련도 하락 */
  unitCost: {
    infantry: {}, spear: { iron: 0.3 }, archer: { wood: 0.3, iron: 0.05 },
    cavalry: { horses: 1, iron: 0.1 }, chariot: { horses: 0.5, iron: 1 },
  } as Record<string, { horses?: number; iron?: number; wood?: number }>,
  organizeTrainDrop: 20, horseRefund: 0.8,
  /** 처음 편제: 보병·창병·궁병 (말 산지·마창이 있으면 기병 조금) */
  startComp: { infantry: 0.45, spear: 0.2, archer: 0.35 } as Record<string, number>,
  startCavalryPerRanch: 0.04,
  /** 전차병은 큰 도시만 (인구, 군현 지도는 /regionPopDiv) */
  chariotCityPop: 70000, regionPopDiv: 12,
  /** v4.1 마창(대3·중2·소1): 계절마다 저절로 ranchPassive×규모 필, '말 기르기'는 품(금·곡식)을 들여 규모×breedPer 필 */
  ranchPassive: 20, /** 쌓아 둔 말은 계절마다 horseDecay만큼 줄어든다 (먹이·늙음) */ horseDecay: 0.04, breedPer: 150, breedGold: 150, breedFoodPerLevel: 1000,
  /** 말 1필 값 = 곡식 horseFoodRatio석 값 (시장 시세를 따른다), 예물로 줄 때 금 가치 */
  horseFoodRatio: 40,
  /** 책사: 지력 이상, 최대 인원, 판단 오차 = (100−지력)/100 × councilNoise, 따르면 충성 + */
  councilMinInt: 70, councilMax: 4, councilNoise: 0.5, councilSims: 40, adviceLoyalty: 3,
  /** 수련·학문: 금, 오르는 폭 1~5 (90 이상은 절반), 스승(같은 성에 그 능력 90+) +1 */
  studyGold: 400, studyMin: 1, studyMax: 5, studyHighFrom: 90,
  /** 함락 때 장수의 운명: 탈출 = 기본 + (통솔+지력−120)/escapeDiv, 전사 = 기본 + (70−무력)/slainDiv */
  fateEscapeBase: 0.62, fateEscapeDiv: 300, fateNoHaven: 0.35, fateSlainBase: 0.03, fateSlainDiv: 1000, fateCavalrySlain: 0.03,
  /** 탈출한 장수는 패잔병을 이끌고 간다: 퇴각 비율 × (0.6 + 통솔/250), 장수가 못 빠져나가면 ×fateLeaderless */
  fateLeaderless: 0.6,
  /** 포로: AI 등용 기본, 플레이어 등용 기본, 처형 시 의리 높은 우리 장수 충성 −, 처분 없이 지나면 석방 */
  aiStudyGold: 4000, aiHorseGold: 6000, aiHorseKeep: 1500, aiOrganizeGap: 0.25, aiBreedGold: 1500,
  captiveRecruitBase: 0.25, captiveExecuteLoyalty: 3, captiveExpire: 8,

  // v4.2 능력치 체계 (docs/design/stats-v4.2.md)
  /** 통솔: 지휘 한도 = 통솔×commandPerLead (+부장·다른 수비 장수 통솔×deputyCommandPer), 넘는 병력은 overCommandEff 효율 */
  commandPerLead: 500, deputyCommandPer: 200, overCommandEff: 0.5, defenseHelpers: 3,
  /** 무력·통솔 접전: 진 쪽 접전 손실 × (clashWarBase + 이긴 쪽 무력/clashWarDiv) × (clashLeadBase − 진 쪽 통솔/clashLeadDiv) */
  clashWarBase: 0.85, clashWarDiv: 400, clashLeadBase: 1.1, clashLeadDiv: 500,
  /** 무력 추격: × (pursuitWarBase + 추격하는 쪽 무력/pursuitWarDiv) */
  pursuitWarBase: 0.75, pursuitWarDiv: 300,
  /** 지력: 불리한 전장의 변수를 (내 지력 − 상대 지력)/fortuneIntDiv 확률로 간파해 막는다 */
  fortuneIntDiv: 120,
  /** 정치 병참: 출진 군량 × (supplyPolBase − 최고 정치/supplyPolDiv) */
  supplyPolBase: 1.15, supplyPolDiv: 400,
  /** 정치 재상: 세력 최고 정치 ≥ chancellorFrom → 금·수확 × (1 + (정치−from)/chancellorDiv) */
  chancellorFrom: 70, chancellorDiv: 300,
  /** 무력 치안: 태수 무력이 이 이상이면 민심 + */
  governorWarOrder: 75,
  /** 매력 징병: 민심 하락 × (conscriptCharmBase − 매력/conscriptCharmDiv), 신병 사기 + (매력−50)/recruitMoraleDiv */
  conscriptCharmBase: 1.3, conscriptCharmDiv: 200, recruitMoraleDiv: 5,
  /** 군주 매력: 충성 변화 계절마다 + (매력−rulerCharmRef)/rulerCharmDiv, 포상 + (매력−60)/rewardCharmDiv */
  rulerCharmRef: 75, rulerCharmDiv: 60, rewardCharmDiv: 8,
  /** 매력: 패배 사기 하락 × (1.2 − 매력/defeatCharmDiv) */
  defeatCharmDiv: 250,
  /** AI 부장: 이만큼 이상 보탬이 될 때만 붙인다 */
  aiDeputyMinGain: 8,
  /** 부장 궁합: 의형제·신뢰 공격 배율 (원수끼리는 함께 출진하지 않음) */
  bondSworn: 1.08, bondTrust: 1.04,
  /** 성장: 능력치 1 오르는 데 드는 경험 (70 미만 / 70~89 / 90+), 나이 배율 */
  growNeed: 40, growNeedB: 70, growNeedS: 140, growYoungAge: 30, growYoungMul: 1.5, growOldAge: 55, growOldMul: 0.5, growAptBase: 0.4,
  /** 성장 경험: 명령 하나마다 */
  growExp: {
    develop: { politics: 8 }, wall: { politics: 5, intellect: 3 }, conscript: { charm: 4 }, train: { leadership: 8, war: 3 },
    recruitOk: { charm: 14 }, recruitFail: { charm: 4 }, diplomacy: { charm: 6, intellect: 4 }, intrigue: { intellect: 8 },
    study: {}, governor: { politics: 0.5 }, breedHorses: { politics: 4 }, relief: { charm: 5, politics: 3 },
  } as Record<string, Partial<Record<'leadership' | 'war' | 'intellect' | 'politics' | 'charm', number>>>,
  /** 전투 경험: 주장 통솔, 부장 무력, 수비 대장 통솔, 일기토, 계책 성공 */
  growBattleLeadWin: 14, growBattleLeadLose: 6, growDeputyWar: 8, growDefLead: 8, growDuelWin: 20, growDuelLose: 6, growTactic: 14,

  // AI
  failedAttackAttrition: 0.45, // 공격 실패 시에도 수비 측이 입는 소모 비율
  aiAttackRatio: 0.95,
} as const;
