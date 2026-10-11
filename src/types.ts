export type BetType = 'wide' | 'quinella' | 'exacta' | 'trio' | 'trifecta';

export const BET_LABELS: Record<BetType, string> = {
  wide: 'ワイド',
  quinella: '2車複',
  exacta: '2車単',
  trio: '3連複',
  trifecta: '3連単',
};

export type Grade = 'GP' | 'G1' | 'G2' | 'G3' | 'F1' | 'F2';

export interface RiderEntry {
  car_no: number;
  rider_id: string;
  rider_name: string;
  prefecture: string;
  grade_class: string;
  score: number;
  style: '逃' | '捲' | '追';
  line_id: number;
  line_pos: number;
  gear_ratio: number;
  win_rate: number;
  top2_rate: number;
  top3_rate: number;
  back_count: number;
  bank_length?: number;
  weather?: string;
  wind_speed?: number;
  wind_dir?: number;
  finish?: number;
  p1?: number;
  p2?: number;
  p3?: number;
}

export interface Race {
  race_id: string; // e.g. "20261010-24-11"
  date: string;
  venue_code: string;
  venue_name: string;
  race_num: number;
  grade: Grade;
  distance: number;
  weather: string;
  wind_speed: number;
  wind_dir: number;
  riders: RiderEntry[];
  lines: { line_id: number; cars: number[] }[];
}

export interface OddsItem {
  race_id: string;
  bet_type: BetType;
  combo: string;
  odds: number;
  captured_at?: string;
}

export interface BetCombo {
  bet_type: BetType;
  combo: string;
  prob: number;
  breakeven_odds: number;
  odds?: number;
  ev?: number;
  stake?: number;
  hit?: boolean;
  category?: string;
  reason?: string;
}

export interface AiMark {
  car_no: number;
  mark: '◎' | '◯' | '▲' | '△' | '☆';
  role: string;
  reason: string;
}

export interface AiFormation {
  type: string;
  combo: string;
  oddsTarget: string;
  confidence: string;
}

export interface AiBetItem {
  combo: string;
  bet_type: BetType;
  category: string;
  targetOddsRange?: string;
  reason: string;
  confidence: string;
  prob?: number;
  odds?: number;
  ev?: number;
  stake?: number;
}

export interface AiAnalysisReport {
  summary: string;
  raceScenario: string;
  marks: AiMark[];
  recommendedFormations: AiFormation[];
  aiBets: AiBetItem[];
  confidenceScore: number;
  tacticalComment: string;
  source?: string;
}

export interface RacePrediction {
  race_id: string;
  date: string;
  bet_type: BetType;
  decision: string;
  win: { car_no: number; p1: number }[];
  bets: BetCombo[];
  aiAnalysis?: AiAnalysisReport;
}

export interface Strategy {
  bet_type: BetType;
  ev: number;
  min_p: number;
  max_n: number;
  n_bets: number;
  n_races: number;
  roi: number;
  hit_rate: number;
  se: number;
  score: number;
}

export interface BacktestReport {
  n_races: number;
  split: [number, number, number];
  model_type: 'rank' | 'harville';
  validation_strategy: Strategy | null;
  test: {
    n_bets: number;
    n_races: number;
    roi: number;
    hit_rate: number;
    ci95: [number, number];
    baselines: {
      favorite: { roi: number; hit_rate: number; n_bets: number };
      ai_top: { roi: number; hit_rate: number; n_bets: number };
    };
    bankroll_sim: {
      kelly: {
        final: number;
        max_drawdown: number;
        total_staked: number;
        curve: number[];
      } | null;
      flat: {
        final: number;
        max_drawdown: number;
        curve: number[];
      } | null;
    };
  } | null;
  walk_forward?: {
    folds: {
      fold: number;
      test_races: number;
      strategy: Partial<Strategy> | null;
      roi: number | null;
      n_bets: number | null;
    }[];
    pooled: {
      roi: number;
      ci95: [number, number];
      n_bets: number;
    } | null;
  } | null;
  disclaimer: string;
}

export interface ScheduleItem {
  date: string;
  venue_code: string;
  venue_name: string;
  grade: Grade;
  category_icon?: string;
  source_url?: string;
  fetched_at?: string;
}

export type AutoBetMode = 'paper' | 'export';

export interface SafetyLimits {
  perRaceMax: number;       // 1レースあたり最大上限額 (円)
  dailyMax: number;         // 1日あたり最大投票額上限 (円)
  consecutiveLossLimit: number; // 連続不的中時の強制一時停止 (回数)
  oddsDropGuard: boolean;   // 締切直前オッズが損益分岐を下回った場合のキャンセル
  balanceFloor: number;     // 残高下限ストッパー (円)
}

export interface AutoBetConfig {
  mode: AutoBetMode;
  enabled: boolean;
  targetBetType: BetType;
  minEv: number;
  minProb: number;
  maxBetsPerRace: number;
  kellyFrac: number;
  timingMinutesBefore: number;
  targetGrades: Grade[];
  safety: SafetyLimits;
  aiHonmeiPriority?: boolean;
}

export interface AutoBetRecord {
  id: string;
  timestamp: string;
  race_id: string;
  venue_name: string;
  race_num: number;
  bet_type: BetType;
  combo: string;
  stake: number;
  odds: number;
  ev: number;
  status: 'placed' | 'won' | 'lost' | 'canceled_odds_drop' | 'blocked_by_safety';
  payout: number;
  profit: number;
  balanceAfter: number;
  note?: string;
}

