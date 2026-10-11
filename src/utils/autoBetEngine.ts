import { Race, OddsItem, AutoBetConfig, AutoBetRecord, BetCombo } from '../types';
import { computeComboProbs, allocateKelly } from './keirinMath';

export const DEFAULT_AUTO_BET_CONFIG: AutoBetConfig = {
  mode: 'paper',
  enabled: false,
  targetBetType: 'trifecta',
  minEv: 1.20,
  minProb: 0.02,
  maxBetsPerRace: 3,
  kellyFrac: 0.25,
  timingMinutesBefore: 3,
  targetGrades: ['GP', 'G1', 'G2', 'G3', 'F1', 'F2'],
  safety: {
    perRaceMax: 3000,
    dailyMax: 20000,
    consecutiveLossLimit: 5,
    oddsDropGuard: true,
    balanceFloor: 10000,
  },
  aiHonmeiPriority: true,
};

export interface AutoBetEvaluationResult {
  race_id: string;
  venue_name: string;
  race_num: number;
  betsToPlace: BetCombo[];
  blockedReason?: string;
}

export function evaluateRaceForAutoBet(
  race: Race,
  oddsList: OddsItem[],
  config: AutoBetConfig,
  currentBalance: number,
  todayTotalStaked: number,
  consecutiveLosses: number
): AutoBetEvaluationResult {
  // Check Safety Circuit Breakers first
  if (currentBalance < config.safety.balanceFloor) {
    return {
      race_id: race.race_id,
      venue_name: race.venue_name,
      race_num: race.race_num,
      betsToPlace: [],
      blockedReason: `残高下限ガード作動: 残高 (¥${currentBalance.toLocaleString()}) が下限 (¥${config.safety.balanceFloor.toLocaleString()}) 未満です`,
    };
  }

  if (todayTotalStaked >= config.safety.dailyMax) {
    return {
      race_id: race.race_id,
      venue_name: race.venue_name,
      race_num: race.race_num,
      betsToPlace: [],
      blockedReason: `1日投票上限ガード作動: 本日累計投票額 (¥${todayTotalStaked.toLocaleString()}) が上限 (¥${config.safety.dailyMax.toLocaleString()}) に達しました`,
    };
  }

  if (consecutiveLosses >= config.safety.consecutiveLossLimit) {
    return {
      race_id: race.race_id,
      venue_name: race.venue_name,
      race_num: race.race_num,
      betsToPlace: [],
      blockedReason: `連敗リミッター作動: ${consecutiveLosses}連敗に達したため自動一時停止中`,
    };
  }

  // Check grade filter
  if (!config.targetGrades.includes(race.grade)) {
    return {
      race_id: race.race_id,
      venue_name: race.venue_name,
      race_num: race.race_num,
      betsToPlace: [],
      blockedReason: `対象外グレード (${race.grade}) のためスキップ`,
    };
  }

  // Calculate probabilities
  const cars = race.riders.map(r => r.car_no);
  const p1Arr = race.riders.map(r => r.p1 || 1 / cars.length);
  const p2Arr = race.riders.map(r => r.p2 || p1Arr[r.car_no - 1]);
  const p3Arr = race.riders.map(r => r.p3 || p1Arr[r.car_no - 1]);

  const combos = computeComboProbs(cars, p1Arr, p2Arr, p3Arr);
  const filtered = combos.filter(c => c.bet_type === config.targetBetType);

  // Map odds
  const oddsMap = new Map<string, number>();
  oddsList
    .filter(o => o.race_id === race.race_id && o.bet_type === config.targetBetType)
    .forEach(o => oddsMap.set(o.combo, o.odds));

  const candidates: BetCombo[] = filtered
    .map(c => {
      const odds = oddsMap.get(c.combo) || Math.round((0.75 / Math.max(c.prob, 0.001)) * 10) / 10;
      const be = Math.round((1.0 / Math.max(c.prob, 0.0001)) * 10) / 10;
      const ev = Math.round((c.prob * odds) * 100) / 100;
      return {
        bet_type: c.bet_type,
        combo: c.combo,
        prob: c.prob,
        breakeven_odds: be,
        odds,
        ev,
      };
    })
    .filter(b => (b.ev || 0) >= config.minEv && b.prob >= config.minProb)
    .sort((a, b) => (b.ev || 0) - (a.ev || 0))
    .slice(0, config.maxBetsPerRace);

  if (candidates.length === 0) {
    return {
      race_id: race.race_id,
      venue_name: race.venue_name,
      race_num: race.race_num,
      betsToPlace: [],
      blockedReason: `期待値条件 (EV ≥ ${config.minEv}) を満たす買い目なし`,
    };
  }

  // Odds drop guard
  if (config.safety.oddsDropGuard) {
    for (const b of candidates) {
      if ((b.odds || 0) < b.breakeven_odds) {
        return {
          race_id: race.race_id,
          venue_name: race.venue_name,
          race_num: race.race_num,
          betsToPlace: [],
          blockedReason: `オッズ低下ガード作動: 買い目 ${b.combo} のオッズ (${b.odds}倍) が損益分岐 (${b.breakeven_odds}倍) を下回りました`,
        };
      }
    }
  }

  // Allocate Stakes using Kelly
  const stakes = allocateKelly(
    candidates.map(b => ({ prob: b.prob, odds: b.odds || 1 })),
    currentBalance,
    config.kellyFrac,
    0.03, // 3% per bet
    0.10  // 10% per race
  );

  let raceTotalStake = 0;
  candidates.forEach((b, idx) => {
    b.stake = stakes[idx];
    raceTotalStake += b.stake || 0;
  });

  // Enforce perRaceMax
  if (raceTotalStake > config.safety.perRaceMax) {
    const scale = config.safety.perRaceMax / raceTotalStake;
    candidates.forEach(b => {
      b.stake = Math.floor(((b.stake || 0) * scale) / 100) * 100;
    });
  }

  // Enforce dailyMax remaining
  const remainingDaily = config.safety.dailyMax - todayTotalStaked;
  if (raceTotalStake > remainingDaily) {
    const scale = remainingDaily / raceTotalStake;
    candidates.forEach(b => {
      b.stake = Math.floor(((b.stake || 0) * scale) / 100) * 100;
    });
  }

  const validBets = candidates.filter(b => (b.stake || 0) > 0);

  return {
    race_id: race.race_id,
    venue_name: race.venue_name,
    race_num: race.race_num,
    betsToPlace: validBets,
    blockedReason: validBets.length === 0 ? '資金配分により賭け金が0円のため見送り' : undefined,
  };
}

// Convert AutoBet records to CSV for PAT / automated slip importing
export function exportBetSlipCSV(records: AutoBetRecord[]): string {
  const headers = ['日時', 'レースID', '競輪場', 'レース番号', '券種', '組番', 'オッズ', '期待値', '購入金額(円)', 'ステータス', '払戻金(円)', '損益(円)'];
  const rows = records.map(r => [
    r.timestamp,
    r.race_id,
    r.venue_name,
    r.race_num,
    r.bet_type,
    r.combo,
    r.odds,
    r.ev,
    r.stake,
    r.status,
    r.payout,
    r.profit,
  ].join(','));
  return [headers.join(','), ...rows].join('\n');
}
