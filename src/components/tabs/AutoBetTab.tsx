import React, { useState, useEffect } from 'react';
import { Bot, Play, Square, Shield, AlertTriangle, Download, RefreshCw, CheckCircle2, XCircle, ArrowUpRight, ArrowDownRight, DollarSign, Clock, Settings2, Trash2 } from 'lucide-react';
import { Race, OddsItem, AutoBetConfig, AutoBetRecord, BET_LABELS, Grade } from '../../types';
import { evaluateRaceForAutoBet, exportBetSlipCSV, DEFAULT_AUTO_BET_CONFIG } from '../../utils/autoBetEngine';

interface AutoBetTabProps {
  races: Race[];
  oddsList: OddsItem[];
  records: AutoBetRecord[];
  setRecords: React.Dispatch<React.SetStateAction<AutoBetRecord[]>>;
  balance: number;
  setBalance: React.Dispatch<React.SetStateAction<number>>;
  config: AutoBetConfig;
  setConfig: React.Dispatch<React.SetStateAction<AutoBetConfig>>;
  onLog: (msg: string, type?: 'info' | 'warn' | 'error' | 'success') => void;
}

export const AutoBetTab: React.FC<AutoBetTabProps> = ({
  races,
  oddsList,
  records,
  setRecords,
  balance,
  setBalance,
  config,
  setConfig,
  onLog,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [currentRaceIndex, setCurrentRaceIndex] = useState(0);
  const [countdown, setCountdown] = useState(15);
  const [consecutiveLosses, setConsecutiveLosses] = useState(0);
  const [todayStaked, setTodayStaked] = useState(0);

  // Compute stats
  const totalPayout = records.reduce((sum, r) => sum + r.payout, 0);
  const netProfit = totalPayout - todayStaked;
  const winCount = records.filter(r => r.status === 'won').length;
  const settledCount = records.filter(r => r.status === 'won' || r.status === 'lost').length;
  const hitRate = settledCount > 0 ? (winCount / settledCount) * 100 : 0;
  const roi = todayStaked > 0 ? (totalPayout / todayStaked) * 100 : 0;

  // Active upcoming race
  const activeRace = races[currentRaceIndex % (races.length || 1)];

  // Simulate auto-bet loop when running
  useEffect(() => {
    if (!isRunning || races.length === 0) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Trigger automated cycle for current race
          executeCycle();
          return 15; // reset countdown for next race
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, currentRaceIndex, balance, todayStaked, consecutiveLosses, races, oddsList, config]);

  const executeCycle = () => {
    if (!activeRace) return;

    onLog(`[自動投票] ${activeRace.venue_name} ${activeRace.race_num}R (${activeRace.race_id}) の直前オッズ判定中...`, 'info');

    const evalResult = evaluateRaceForAutoBet(
      activeRace,
      oddsList,
      config,
      balance,
      todayStaked,
      consecutiveLosses
    );

    if (evalResult.blockedReason) {
      onLog(`[自動投票判定] ${evalResult.venue_name} ${evalResult.race_num}R: ${evalResult.blockedReason}`, 'warn');
      // Advance to next race
      setCurrentRaceIndex(prev => (prev + 1) % races.length);
      return;
    }

    if (evalResult.betsToPlace.length === 0) {
      onLog(`[自動投票判定] ${evalResult.venue_name} ${evalResult.race_num}R: 条件合致の買い目なし（見送り）`, 'info');
      setCurrentRaceIndex(prev => (prev + 1) % races.length);
      return;
    }

    // Place the bets!
    const nowStr = new Date().toLocaleTimeString();
    let cycleStake = 0;
    const newRecords: AutoBetRecord[] = [];

    // Determine race finish to settle immediately in paper trading
    const topFinish = activeRace.riders
      .filter(r => (r.finish || 99) <= 3)
      .sort((a, b) => (a.finish || 99) - (b.finish || 99))
      .map(r => r.car_no);

    const winningTrifecta = topFinish.slice(0, 3).join('-');
    const winningExacta = topFinish.slice(0, 2).join('-');

    let isCycleWon = false;

    evalResult.betsToPlace.forEach(b => {
      const stake = b.stake || 100;
      cycleStake += stake;

      // Check if this bet hits
      let isHit = false;
      if (b.bet_type === 'trifecta' && b.combo === winningTrifecta) isHit = true;
      if (b.bet_type === 'exacta' && b.combo === winningExacta) isHit = true;
      if (b.bet_type === 'quinella') {
        const sortedWinningQ = topFinish.slice(0, 2).sort((x, y) => x - y).join('-');
        if (b.combo === sortedWinningQ) isHit = true;
      }
      if (b.bet_type === 'trio') {
        const sortedWinningTrio = topFinish.slice(0, 3).sort((x, y) => x - y).join('-');
        if (b.combo === sortedWinningTrio) isHit = true;
      }

      if (isHit) isCycleWon = true;

      const payout = isHit ? Math.round(stake * (b.odds || 1)) : 0;
      const profit = payout - stake;

      const rec: AutoBetRecord = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: nowStr,
        race_id: activeRace.race_id,
        venue_name: activeRace.venue_name,
        race_num: activeRace.race_num,
        bet_type: b.bet_type,
        combo: b.combo,
        stake,
        odds: b.odds || 1,
        ev: b.ev || 1,
        status: isHit ? 'won' : 'lost',
        payout,
        profit,
        balanceAfter: balance - stake + payout,
      };

      newRecords.push(rec);

      if (isHit) {
        onLog(`🎯 【的中】${activeRace.venue_name} ${activeRace.race_num}R ${b.combo} 払戻: ¥${payout.toLocaleString()} (オッズ: ${b.odds}倍)`, 'success');
      } else {
        onLog(`  [投票結果] ${activeRace.venue_name} ${activeRace.race_num}R ${b.combo} (¥${stake.toLocaleString()}) 不的中`, 'info');
      }
    });

    const netCycleProfit = newRecords.reduce((sum, r) => sum + r.profit, 0);

    setRecords(prev => [newRecords[0], ...prev]);
    setBalance(prev => prev + netCycleProfit);
    setTodayStaked(prev => prev + cycleStake);

    if (isCycleWon) {
      setConsecutiveLosses(0);
    } else {
      setConsecutiveLosses(prev => prev + 1);
    }

    // Advance to next race
    setCurrentRaceIndex(prev => (prev + 1) % races.length);
  };

  const handleToggleRunning = () => {
    if (!isRunning) {
      if (races.length === 0) {
        onLog('エラー: 投票対象のレースデータがありません。①データタブで準備してください。', 'error');
        return;
      }
      setIsRunning(true);
      onLog(`自動投票ボットを開始しました (モード: ${config.mode === 'paper' ? '仮想ペーパートレード' : '実連携データ出力'})`, 'success');
    } else {
      setIsRunning(false);
      onLog('自動投票ボットを停止しました。', 'warn');
    }
  };

  const handleManualSingleTest = () => {
    executeCycle();
  };

  const handleExportCSV = () => {
    if (records.length === 0) {
      onLog('出力する投票データがありません。', 'warn');
      return;
    }
    const csv = exportBetSlipCSV(records);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auto_bet_slip_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onLog('投票伝票 CSV をエクスポートしました。', 'success');
  };

  const handleClearHistory = () => {
    setRecords([]);
    setTodayStaked(0);
    setConsecutiveLosses(0);
    onLog('自動投票履歴をクリアしました。', 'info');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Deck */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isRunning ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-neutral-800 text-neutral-400'}`}>
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-neutral-100">
                  自動投票エンジン (Auto Betting & Circuit Breakers)
                </h3>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isRunning ? 'bg-emerald-500/20 text-emerald-400 animate-pulse border border-emerald-500/40' : 'bg-neutral-800 text-neutral-400'}`}>
                  {isRunning ? 'RUNNING (稼働中)' : 'STOPPED (停止中)'}
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                期待値判定と分数ケリー計算に基づき、締切直前の最適タイミングで投票を完全自動実行します
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleRunning}
              className={`px-5 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all shadow-lg ${
                isRunning
                  ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-neutral-950 shadow-emerald-500/20'
              }`}
            >
              {isRunning ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isRunning ? '緊急停止 (STOP)' : '自動投票を開始 (START)'}
            </button>
            <button
              onClick={handleManualSingleTest}
              className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs rounded-lg border border-neutral-700 flex items-center gap-1.5 transition-colors"
              title="次のレースで1回テスト投票を実行"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              1回テスト実行
            </button>
          </div>
        </div>

        {/* Live Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs">
          <div className="bg-neutral-950 p-3 rounded border border-neutral-800">
            <div className="text-neutral-500 text-[11px]">現在残高 (Bankroll)</div>
            <div className="text-lg font-bold font-mono text-emerald-400 tabular-nums">
              ¥{balance.toLocaleString()}
            </div>
          </div>

          <div className="bg-neutral-950 p-3 rounded border border-neutral-800">
            <div className="text-neutral-500 text-[11px]">本日累計投票額</div>
            <div className="text-lg font-bold font-mono text-neutral-200 tabular-nums">
              ¥{todayStaked.toLocaleString()}
            </div>
          </div>

          <div className="bg-neutral-950 p-3 rounded border border-neutral-800">
            <div className="text-neutral-500 text-[11px]">累計払戻金</div>
            <div className="text-lg font-bold font-mono text-neutral-200 tabular-nums">
              ¥{totalPayout.toLocaleString()}
            </div>
          </div>

          <div className="bg-neutral-950 p-3 rounded border border-neutral-800">
            <div className="text-neutral-500 text-[11px]">本日損益 (PnL)</div>
            <div className={`text-lg font-bold font-mono tabular-nums flex items-center gap-1 ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {netProfit >= 0 ? '+' : ''}¥{netProfit.toLocaleString()}
            </div>
          </div>

          <div className="bg-neutral-950 p-3 rounded border border-neutral-800">
            <div className="text-neutral-500 text-[11px]">回収率 / 的中率</div>
            <div className="text-lg font-bold font-mono text-neutral-100 tabular-nums">
              {roi.toFixed(1)}% <span className="text-xs text-neutral-500 font-normal">({hitRate.toFixed(1)}%)</span>
            </div>
          </div>

          <div className="bg-neutral-950 p-3 rounded border border-neutral-800">
            <div className="text-neutral-500 text-[11px]">次回判定レース</div>
            <div className="text-xs font-semibold text-emerald-400 truncate font-mono">
              {activeRace ? `${activeRace.venue_name} ${activeRace.race_num}R` : '待機中'}
            </div>
            <div className="text-[10px] text-neutral-500 font-mono flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              <span>次回実行まで: {isRunning ? `${countdown}秒` : '停止中'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Setup: Mode & Circuit Breakers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Mode & Scheduling Settings */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-3.5">
          <div className="flex items-center gap-2 border-b border-neutral-800 pb-2.5">
            <Settings2 className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-semibold text-neutral-200">投票モード & スケジューラー設定</h4>
          </div>

          <div className="space-y-3 text-xs">
            {/* Mode selection buttons */}
            <div>
              <label className="text-neutral-400 block mb-1.5">動作モード選択</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, mode: 'paper' })}
                  className={`p-2.5 rounded-lg border text-left transition-colors ${
                    config.mode === 'paper'
                      ? 'bg-neutral-800 border-emerald-500 text-neutral-100'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-300'
                  }`}
                >
                  <div className="font-semibold text-emerald-400 mb-0.5">🟢 仮想ペーパートレード</div>
                  <div className="text-[11px] text-neutral-400">実資金ゼロで全自動シミュレーション</div>
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, mode: 'export' })}
                  className={`p-2.5 rounded-lg border text-left transition-colors ${
                    config.mode === 'export'
                      ? 'bg-neutral-800 border-amber-500 text-neutral-100'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-300'
                  }`}
                >
                  <div className="font-semibold text-amber-400 mb-0.5">🟡 実投票データ連携 (PAT/CSV)</div>
                  <div className="text-[11px] text-neutral-400">投票指示CSVを自動生成し外部連携</div>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-neutral-400 block mb-1">対象券種</label>
                <select
                  value={config.targetBetType}
                  onChange={e => setConfig({ ...config, targetBetType: e.target.value as any })}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 font-mono text-neutral-200 focus:outline-none"
                >
                  <option value="trifecta">3連単 (Trifecta)</option>
                  <option value="exacta">2車単 (Exacta)</option>
                  <option value="trio">3連複 (Trio)</option>
                  <option value="quinella">2車複 (Quinella)</option>
                  <option value="wide">ワイド (Wide)</option>
                </select>
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">最小期待値 (EV ≥)</label>
                <input
                  type="number"
                  step="0.05"
                  value={config.minEv}
                  onChange={e => setConfig({ ...config, minEv: parseFloat(e.target.value) || 1.1 })}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 font-mono text-neutral-200 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">1レース最大点数</label>
                <input
                  type="number"
                  value={config.maxBetsPerRace}
                  onChange={e => setConfig({ ...config, maxBetsPerRace: parseInt(e.target.value, 10) || 3 })}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 font-mono text-neutral-200 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">ケリー係数 (f*)</label>
                <input
                  type="number"
                  step="0.05"
                  value={config.kellyFrac}
                  onChange={e => setConfig({ ...config, kellyFrac: parseFloat(e.target.value) || 0.25 })}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 font-mono text-neutral-200 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-neutral-800">
              <label className="flex items-center gap-2 cursor-pointer text-neutral-300">
                <input
                  type="checkbox"
                  checked={config.aiHonmeiPriority ?? true}
                  onChange={e => setConfig({ ...config, aiHonmeiPriority: e.target.checked })}
                  className="w-4 h-4 rounded bg-neutral-950 border-neutral-700 text-emerald-500 focus:ring-0"
                />
                <span className="font-medium text-emerald-300">🤖 Gemini AI 予想（◎本命・推奨フォーメーション）を優先判定</span>
              </label>
            </div>
          </div>
        </div>

        {/* Safety Circuit Breakers Panel */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-3.5">
          <div className="flex items-center gap-2 border-b border-neutral-800 pb-2.5">
            <Shield className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-semibold text-neutral-200">セーフティ・サーキットブレーカー (安全装置)</h4>
          </div>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-neutral-400 block mb-1">1レース上限金額 (円)</label>
                <input
                  type="number"
                  value={config.safety.perRaceMax}
                  onChange={e => setConfig({
                    ...config,
                    safety: { ...config.safety, perRaceMax: parseInt(e.target.value, 10) || 1000 }
                  })}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 font-mono text-neutral-200 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">1日最大投票上限 (円)</label>
                <input
                  type="number"
                  value={config.safety.dailyMax}
                  onChange={e => setConfig({
                    ...config,
                    safety: { ...config.safety, dailyMax: parseInt(e.target.value, 10) || 10000 }
                  })}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 font-mono text-neutral-200 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">連敗ストッパー (回数)</label>
                <input
                  type="number"
                  value={config.safety.consecutiveLossLimit}
                  onChange={e => setConfig({
                    ...config,
                    safety: { ...config.safety, consecutiveLossLimit: parseInt(e.target.value, 10) || 5 }
                  })}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 font-mono text-neutral-200 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">残高下限ストッパー (円)</label>
                <input
                  type="number"
                  value={config.safety.balanceFloor}
                  onChange={e => setConfig({
                    ...config,
                    safety: { ...config.safety, balanceFloor: parseInt(e.target.value, 10) || 5000 }
                  })}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 font-mono text-neutral-200 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-neutral-300">
                <input
                  type="checkbox"
                  checked={config.safety.oddsDropGuard}
                  onChange={e => setConfig({
                    ...config,
                    safety: { ...config.safety, oddsDropGuard: e.target.checked }
                  })}
                  className="w-4 h-4 rounded bg-neutral-950 border-neutral-700 text-emerald-500 focus:ring-0"
                />
                <span>直前オッズ急変ガード（損益分岐オッズを下回った買い目を自動除外）</span>
              </label>
            </div>

            <div className="p-2.5 rounded bg-neutral-950 border border-neutral-800 text-[11px] text-neutral-400 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>
                上限超過・急変検知・連敗発生時はシステムが自動で投票を一時停止し、ログに警告を出力します。
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Ledger & Execution History */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-neutral-900/90 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-neutral-200">
              自動投票 履歴台帳 (Execution Ledger)
            </h4>
            <span className="text-neutral-500 font-mono">[{records.length} 件]</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              投票伝票 CSV 出力
            </button>
            <button
              onClick={handleClearHistory}
              className="px-3 py-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 rounded flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              クリア
            </button>
          </div>
        </div>

        <div className="p-3">
          {records.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500">
              まだ投票履歴はありません。「自動投票を開始」または「1回テスト実行」を押すと投票が行われます。
            </div>
          ) : (
            <div className="border border-neutral-800 rounded overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-neutral-950 text-neutral-400 font-mono border-b border-neutral-800 sticky top-0">
                  <tr>
                    <th className="py-2 px-3">時刻</th>
                    <th className="py-2 px-3">レース</th>
                    <th className="py-2 px-3">買い目</th>
                    <th className="py-2 px-3 text-right">オッズ</th>
                    <th className="py-2 px-3 text-right">EV</th>
                    <th className="py-2 px-3 text-right">購入額</th>
                    <th className="py-2 px-3">状態</th>
                    <th className="py-2 px-3 text-right">払戻金</th>
                    <th className="py-2 px-3 text-right">損益</th>
                    <th className="py-2 px-3 text-right">残高</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800 font-mono text-neutral-300">
                  {records.map(r => (
                    <tr key={r.id} className="hover:bg-neutral-800/40 transition-colors">
                      <td className="py-2 px-3 text-neutral-500 tabular-nums">{r.timestamp}</td>
                      <td className="py-2 px-3 font-sans font-medium text-neutral-200">
                        {r.venue_name} {r.race_num}R
                      </td>
                      <td className="py-2 px-3 font-semibold text-neutral-100">
                        <span className="text-neutral-500 font-sans text-[11px] mr-1">{BET_LABELS[r.bet_type]}</span>
                        {r.combo}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{r.odds.toFixed(1)}倍</td>
                      <td className="py-2 px-3 text-right tabular-nums text-neutral-400">{r.ev.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold">
                        ¥{r.stake.toLocaleString()}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          r.status === 'won'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : r.status === 'lost'
                            ? 'bg-neutral-800 text-neutral-400'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {r.status === 'won' ? '的中' : r.status === 'lost' ? '不的中' : '投票済'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-emerald-400">
                        ¥{r.payout.toLocaleString()}
                      </td>
                      <td className={`py-2 px-3 text-right tabular-nums font-bold ${r.profit > 0 ? 'text-emerald-400' : r.profit < 0 ? 'text-rose-400' : 'text-neutral-400'}`}>
                        {r.profit > 0 ? '+' : ''}¥{r.profit.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-neutral-400">
                        ¥{r.balanceAfter.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
