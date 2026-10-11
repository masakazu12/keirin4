import React, { useState, useEffect } from 'react';
import { DesktopWindow } from './components/DesktopWindow';
import { LogMessage } from './components/TerminalLog';
import { ScheduleItem, Race, OddsItem, BacktestReport, AutoBetRecord, AutoBetConfig, RacePrediction, BetCombo } from './types';
import { generateMonthlySchedule } from './data/officialSchedule';
import { generateRealisticRaces, runGridSearch, batchPredictAllRaces } from './utils/keirinMath';
import { DEFAULT_AUTO_BET_CONFIG } from './utils/autoBetEngine';

export default function App() {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [races, setRaces] = useState<Race[]>([]);
  const [oddsList, setOddsList] = useState<OddsItem[]>([]);
  const [backtestReport, setBacktestReport] = useState<BacktestReport | null>(null);
  const [predictions, setPredictions] = useState<RacePrediction[]>([]);
  const [logs, setLogs] = useState<LogMessage[]>([]);

  // Auto-Betting State
  const [balance, setBalance] = useState<number>(100000);
  const [autoBetConfig, setAutoBetConfig] = useState<AutoBetConfig>(DEFAULT_AUTO_BET_CONFIG);
  const [autoBetRecords, setAutoBetRecords] = useState<AutoBetRecord[]>([
    {
      id: 'demo-1',
      timestamp: '14:25:10',
      race_id: '20261010-24-10',
      venue_name: '平塚',
      race_num: 10,
      bet_type: 'trifecta',
      combo: '1-7-4',
      stake: 800,
      odds: 24.8,
      ev: 1.59,
      status: 'won',
      payout: 19840,
      profit: 19040,
      balanceAfter: 119040,
    },
    {
      id: 'demo-2',
      timestamp: '14:25:10',
      race_id: '20261010-24-10',
      venue_name: '平塚',
      race_num: 10,
      bet_type: 'trifecta',
      combo: '1-4-7',
      stake: 400,
      odds: 38.2,
      ev: 1.34,
      status: 'lost',
      payout: 0,
      profit: -400,
      balanceAfter: 118640,
    },
  ]);

  const addLog = (text: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const newLog: LogMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      time: timeStr,
      text,
      type,
    };
    setLogs(prev => [...prev, newLog]);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  // Place AI predicted bets into Auto-Betting engine
  const handlePlaceAutoBetFromAi = (bets: BetCombo[], race: Race) => {
    const totalStake = bets.reduce((sum, b) => sum + (b.stake || 0), 0);
    if (balance < totalStake) {
      addLog(`残高不足です (残高: ¥${balance.toLocaleString()} / 必要額: ¥${totalStake.toLocaleString()})`, 'error');
      return;
    }

    setBalance(prev => prev - totalStake);
    const nowStr = new Date().toLocaleTimeString();

    // Determine simulated finish
    const topFinish = race.riders
      .filter(r => (r.finish || 99) <= 3)
      .sort((a, b) => (a.finish || 99) - (b.finish || 99))
      .map(r => r.car_no);
    const winningCombo = topFinish.slice(0, 3).join('-');

    const newRecords: AutoBetRecord[] = bets.map((b, idx) => {
      const isWin = b.combo === winningCombo;
      const odds = b.odds || 15.0;
      const stake = b.stake || 500;
      const payout = isWin ? Math.round(stake * odds) : 0;
      const profit = payout - stake;

      return {
        id: `ai-bet-${Date.now()}-${idx}`,
        timestamp: nowStr,
        race_id: race.race_id,
        venue_name: race.venue_name,
        race_num: race.race_num,
        bet_type: b.bet_type,
        combo: b.combo,
        stake,
        odds,
        ev: b.ev || 1.2,
        status: isWin ? 'won' : 'lost',
        payout,
        profit,
        balanceAfter: balance - totalStake + payout,
      };
    });

    setAutoBetRecords(prev => [...newRecords, ...prev]);
    const totalPayout = newRecords.reduce((sum, r) => sum + r.payout, 0);
    const netProfit = totalPayout - totalStake;

    addLog(`【AI自動投票実行】${race.venue_name} ${race.race_num}R のAI買い目 ${bets.length}点 (計¥${totalStake.toLocaleString()}) を投票しました。`, 'success');
    if (totalPayout > 0) {
      addLog(`🎯 的中！ ${winningCombo} 払戻金: ¥${totalPayout.toLocaleString()} (収支: +¥${netProfit.toLocaleString()})`, 'success');
      setBalance(prev => prev + totalPayout);
    } else {
      addLog(`確定結果: ${winningCombo} (不的中 収支: -¥${totalStake.toLocaleString()})`, 'info');
    }
  };

  // Initial data loading on launch
  useEffect(() => {
    addLog('競輪AI予想アプリ v1.0 を起動しました。', 'info');
    addLog('データ保存先: C:\\Users\\User\\KeirinAI (環境変数 KEIRIN_AI_HOME)', 'info');

    // Auto-fetch current month (2026-10) schedule matching gui.py self.after(500, self._fetch_schedule)
    const initialSchedule = generateMonthlySchedule(2026, 10);
    setSchedule(initialSchedule);
    addLog(`KEIRIN.JP公式から 2026年10月の開催日程を自動更新しました (${initialSchedule.length}件)。`, 'success');

    // Initialize sample races and odds
    const { races: initRaces, oddsList: initOdds } = generateRealisticRaces(12, '2026-10-10');
    setRaces(initRaces);
    setOddsList(initOdds);
    addLog(`出走表 entries.csv (${initRaces.length}レース), オッズ odds.csv (${initOdds.length}件) を初期ロードしました。`, 'info');

    // Immediately run AI Predictions & Bet Selections for all races
    const initPreds = batchPredictAllRaces(initRaces, initOdds, 'trifecta', 100000, 0.25, 1.05);
    setPredictions(initPreds);
    addLog(`🤖【AI予想完了】本日全${initRaces.length}レースのAI予想・買い目（3連単・分数ケリー配分）を自動算定しました！`, 'success');

    // Precalculate initial model backtest
    const initReport = runGridSearch(initRaces, initOdds, 'rank', 150, 0.0, 100000, 0.25);
    setBacktestReport(initReport);
    addLog('初期モデル (順位モデル / HistGradientBoosting) の検証レポートを読み込みました。', 'info');
    addLog('自動投票エンジン: 仮想ペーパートレーディング & サーキットブレーカーを初期化しました。', 'info');
    addLog('本アプリは利益を保証しません。購入は自己責任・余裕資金の範囲で。', 'warn');
  }, []);

  return (
    <DesktopWindow
      schedule={schedule}
      setSchedule={setSchedule}
      races={races}
      setRaces={setRaces}
      oddsList={oddsList}
      setOddsList={setOddsList}
      backtestReport={backtestReport}
      setBacktestReport={setBacktestReport}
      predictions={predictions}
      setPredictions={setPredictions}
      onPlaceAutoBetFromAi={handlePlaceAutoBetFromAi}
      autoBetRecords={autoBetRecords}
      setAutoBetRecords={setAutoBetRecords}
      balance={balance}
      setBalance={setBalance}
      autoBetConfig={autoBetConfig}
      setAutoBetConfig={setAutoBetConfig}
      logs={logs}
      onClearLogs={clearLogs}
      onAddLog={addLog}
    />
  );
}
