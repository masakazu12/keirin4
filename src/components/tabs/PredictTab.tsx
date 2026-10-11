import React, { useState, useMemo, useEffect } from 'react';
import { Target, Calculator, CheckCircle, AlertCircle, Eye, Sparkles, Filter, ChevronRight, Layers, Bot, Brain, RefreshCw, Copy, Check, Download, Send, ListFilter, Zap, ArrowRight, ShieldCheck, Trophy } from 'lucide-react';
import { Race, OddsItem, BetType, BET_LABELS, BetCombo, RacePrediction, AiAnalysisReport } from '../../types';
import { CAR_COLORS } from '../../data/keirinVenues';
import { computeComboProbs, allocateKelly, generateAiPredictionForRace, batchPredictAllRaces } from '../../utils/keirinMath';

interface PredictTabProps {
  races: Race[];
  oddsList: OddsItem[];
  predictions: RacePrediction[];
  setPredictions: React.Dispatch<React.SetStateAction<RacePrediction[]>>;
  onPlaceAutoBet?: (bets: BetCombo[], race: Race) => void;
  onGoToAutoBet?: () => void;
  onLog: (msg: string, type?: 'info' | 'warn' | 'error' | 'success') => void;
}

export const PredictTab: React.FC<PredictTabProps> = ({
  races,
  oddsList,
  predictions,
  setPredictions,
  onPlaceAutoBet,
  onGoToAutoBet,
  onLog,
}) => {
  const [selectedRaceId, setSelectedRaceId] = useState<string>(races[0]?.race_id || '');
  const [betType, setBetType] = useState<BetType>('trifecta');
  const [bankroll, setBankroll] = useState('100000');
  const [kellyFrac, setKellyFrac] = useState('0.25');
  const [minEvFilter, setMinEvFilter] = useState('1.05');
  const [activeViewMode, setActiveViewMode] = useState<'table' | 'card' | 'formation'>('table');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);

  // Current selected race object
  const selectedRace = useMemo(() => {
    return races.find(r => r.race_id === selectedRaceId) || races[0];
  }, [races, selectedRaceId]);

  // Current prediction for the selected race
  const currentPred = useMemo(() => {
    return predictions.find(p => p.race_id === selectedRace?.race_id);
  }, [predictions, selectedRace]);

  // Automatically ensure prediction exists when race is selected
  useEffect(() => {
    if (!selectedRace) return;
    if (!currentPred) {
      const bRoll = parseFloat(bankroll) || 100000;
      const kFrac = parseFloat(kellyFrac) || 0.25;
      const evThresh = parseFloat(minEvFilter) || 1.05;
      const generated = generateAiPredictionForRace(selectedRace, oddsList, betType, bRoll, kFrac, evThresh);
      setPredictions(prev => [generated, ...prev.filter(p => p.race_id !== selectedRace.race_id)]);
    }
  }, [selectedRace, currentPred, oddsList, betType, bankroll, kellyFrac, minEvFilter, setPredictions]);

  // Re-run Mathematical prediction for selected race
  const handleMathPredict = () => {
    if (!selectedRace) {
      onLog('予想対象のレースがありません。', 'warn');
      return;
    }
    const bRoll = parseFloat(bankroll) || 100000;
    const kFrac = parseFloat(kellyFrac) || 0.25;
    const evThresh = parseFloat(minEvFilter) || 1.05;

    onLog(`[数理AI] ${selectedRace.venue_name} ${selectedRace.race_num}R の予想と買い目を計算中...`, 'info');
    const pred = generateAiPredictionForRace(selectedRace, oddsList, betType, bRoll, kFrac, evThresh);

    setPredictions(prev => [pred, ...prev.filter(p => p.race_id !== selectedRace.race_id)]);
    onLog(`[数理AI完了] ${pred.decision} 推奨買い目 ${pred.bets.length}点`, 'success');
  };

  // Dedicated Gemini AI Race Prediction & Tactical Analysis via server API
  const handleAiPredict = async () => {
    if (!selectedRace) {
      onLog('予想対象のレースがありません。', 'warn');
      return;
    }
    setIsAiLoading(true);
    onLog(`[Gemini AI] ${selectedRace.venue_name} ${selectedRace.race_num}R の展開・印・買い目分析を開始...`, 'info');

    try {
      const res = await fetch('/api/ai/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ race: selectedRace, betType }),
      });
      const data = await res.json();

      if (data.success && data.prediction) {
        const pred = data.prediction;
        const bRoll = parseFloat(bankroll) || 100000;
        const kFrac = parseFloat(kellyFrac) || 0.25;

        // Calculate probabilities for the race
        const cars = selectedRace.riders.map(r => r.car_no);
        const p1Arr = selectedRace.riders.map(r => r.p1 || 1 / cars.length);
        const p2Arr = selectedRace.riders.map(r => r.p2 || p1Arr[r.car_no - 1]);
        const p3Arr = selectedRace.riders.map(r => r.p3 || p1Arr[r.car_no - 1]);
        const combos = computeComboProbs(cars, p1Arr, p2Arr, p3Arr);

        const oddsMap = new Map<string, number>();
        oddsList
          .filter(o => o.race_id === selectedRace.race_id && o.bet_type === betType)
          .forEach(o => oddsMap.set(o.combo, o.odds));

        // Evaluate AI bets
        const evaluatedAiBets: BetCombo[] = (pred.aiBets || []).map((ab: any) => {
          const matchedCombo = combos.find(c => c.bet_type === betType && c.combo === ab.combo);
          const prob = matchedCombo?.prob || 0.045;
          const odds = oddsMap.get(ab.combo) || Math.round((0.75 / Math.max(prob, 0.001)) * 10) / 10;
          const be = Math.round((1.0 / Math.max(prob, 0.0001)) * 10) / 10;
          const ev = Math.round((prob * odds) * 100) / 100;
          return {
            bet_type: betType,
            combo: ab.combo,
            prob,
            breakeven_odds: be,
            odds,
            ev,
            category: ab.category || 'AI推奨',
            reason: ab.reason || '',
            hit: false,
          };
        });

        // Allocate stakes using fractional Kelly
        if (evaluatedAiBets.length > 0) {
          const stakes = allocateKelly(
            evaluatedAiBets.map(b => ({ prob: b.prob, odds: b.odds || 1 })),
            bRoll,
            kFrac,
            0.03, // 3% per bet
            0.10  // 10% per race
          );
          evaluatedAiBets.forEach((b, idx) => {
            b.stake = stakes[idx] > 0 ? stakes[idx] : 500;
          });
        }

        const newPred: RacePrediction = {
          race_id: selectedRace.race_id,
          date: selectedRace.date,
          bet_type: betType,
          decision: `AI推奨買い目あり (${evaluatedAiBets.length}点)`,
          win: selectedRace.riders.map(r => ({ car_no: r.car_no, p1: r.p1 || 0 })),
          bets: evaluatedAiBets,
          aiAnalysis: {
            ...pred,
            source: data.source === 'gemini' ? 'Google Gemini 3.8 Flash' : 'Keirin AI Engine',
          },
        };

        setPredictions(prev => [newPred, ...prev.filter(p => p.race_id !== selectedRace.race_id)]);
        const honmei = pred.marks?.find((m: any) => m.mark === '◎');
        onLog(`[Gemini AI] 買い目を算出しました (${evaluatedAiBets.length}点): ${evaluatedAiBets.map(b => b.combo).join(', ')} (本命: ${honmei ? `${honmei.car_no}番車` : '確定'})`, 'success');
      } else {
        throw new Error(data.error || 'AI予想データの取得に失敗しました');
      }
    } catch (err: any) {
      onLog(`AI予想エラー: ${err.message}`, 'error');
      // Fallback to mathematical model
      handleMathPredict();
    } finally {
      setIsAiLoading(false);
    }
  };

  // Run Batch AI Prediction for all 12 races
  const handleBatchPredictAll = () => {
    onLog(`[一括AI予想] 本日全${races.length}レースのAI予想 & 買い目の一括生成を開始...`, 'info');
    const bRoll = parseFloat(bankroll) || 100000;
    const kFrac = parseFloat(kellyFrac) || 0.25;
    const evThresh = parseFloat(minEvFilter) || 1.05;

    const allPreds = batchPredictAllRaces(races, oddsList, betType, bRoll, kFrac, evThresh);
    setPredictions(allPreds);
    setIsBatchModalOpen(true);

    const totalBetsCount = allPreds.reduce((sum, p) => sum + p.bets.length, 0);
    const totalStakes = allPreds.reduce((sum, p) => sum + p.bets.reduce((s, b) => s + (b.stake || 0), 0), 0);
    onLog(`[一括AI予想完了] 全${races.length}レースの買い目を算出しました (合計${totalBetsCount}点 / 推奨投資¥${totalStakes.toLocaleString()})`, 'success');
  };

  // Copy betting slips to clipboard formatted for Keirin voting websites
  const handleCopyBetSlip = () => {
    if (!currentPred || currentPred.bets.length === 0) return;

    const lines = [
      `【${selectedRace?.venue_name}競輪 ${selectedRace?.race_num}R (${selectedRace?.grade}) AI予想買い目】`,
      `券種: ${BET_LABELS[currentPred.bet_type]}`,
      `AI本命: ◎ ${aiAnalysis?.marks.find(m => m.mark === '◎')?.car_no}番車`,
      '------------------------------',
      ...currentPred.bets.map((b, idx) => {
        const cat = b.category ? `[${b.category}] ` : '';
        return `${idx + 1}. ${cat}${b.combo} (オッズ:${b.odds}倍 / EV:${b.ev}) 推奨:¥${(b.stake || 0).toLocaleString()}円`;
      }),
      '------------------------------',
      `合計点数: ${currentPred.bets.length}点`,
      `合計投資額: ¥${currentPred.bets.reduce((sum, b) => sum + (b.stake || 0), 0).toLocaleString()}円`,
      `※自己責任・余裕資金の範囲で投票してください。`,
    ];

    const textToCopy = lines.join('\n');
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2500);
      onLog('AI買い目をクリップボードにコピーしました（投票サイト貼り付け用）。', 'success');
    });
  };

  // Download betting slips as CSV
  const handleDownloadCsv = () => {
    if (!currentPred || currentPred.bets.length === 0) return;
    const headers = ['race_id', 'venue', 'race_num', 'bet_type', 'combo', 'category', 'odds', 'prob', 'ev', 'stake_yen', 'reason'];
    const rows = currentPred.bets.map(b => [
      selectedRace?.race_id,
      selectedRace?.venue_name,
      selectedRace?.race_num,
      b.bet_type,
      b.combo,
      `"${b.category || ''}"`,
      b.odds,
      (b.prob * 100).toFixed(2),
      b.ev,
      b.stake || 0,
      `"${b.reason || ''}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `keirin_ai_bets_${selectedRace?.race_id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onLog(`買い目CSVをダウンロードしました: keirin_ai_bets_${selectedRace?.race_id}.csv`, 'info');
  };

  // Send bets to Auto-Betting engine
  const handleSendToAutoBet = () => {
    if (!currentPred || currentPred.bets.length === 0 || !selectedRace) return;
    if (onPlaceAutoBet) {
      onPlaceAutoBet(currentPred.bets, selectedRace);
    }
  };

  const aiAnalysis = currentPred?.aiAnalysis;

  // Filtered bets based on category filter
  const displayedBets = useMemo(() => {
    if (!currentPred) return [];
    if (categoryFilter === 'all') return currentPred.bets;
    return currentPred.bets.filter(b => b.category?.includes(categoryFilter));
  }, [currentPred, categoryFilter]);

  // Calculate summary metrics for current bets
  const totalStake = currentPred?.bets.reduce((sum, b) => sum + (b.stake || 0), 0) || 0;
  const maxOdds = currentPred?.bets.reduce((max, b) => Math.max(max, b.odds || 0), 0) || 0;
  const avgEv = currentPred?.bets.length ? (currentPred.bets.reduce((sum, b) => sum + (b.ev || 0), 0) / currentPred.bets.length).toFixed(2) : '0';

  return (
    <div className="space-y-5">
      {/* 1. Quick Race Selector Ribbon (1R〜12R) */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5">
        <div className="flex items-center justify-between gap-2 mb-2 px-1 text-xs text-neutral-400">
          <div className="flex items-center gap-1.5 font-medium text-neutral-300">
            <Trophy className="w-3.5 h-3.5 text-emerald-400" />
            <span>本日の開催レース一覧（クイック切替）</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBatchPredictAll}
              className="px-2.5 py-1 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-neutral-950 font-bold rounded text-[11px] flex items-center gap-1 shadow-sm transition-all"
            >
              <Zap className="w-3 h-3" />
              全12レース一括AI予想
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {races.map((r, idx) => {
            const isSelected = r.race_id === selectedRaceId;
            const pred = predictions.find(p => p.race_id === r.race_id);
            const hasBets = pred && pred.bets.length > 0;
            const honmeiCar = pred?.aiAnalysis?.marks.find(m => m.mark === '◎')?.car_no;

            return (
              <button
                key={r.race_id}
                onClick={() => setSelectedRaceId(r.race_id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg border text-left transition-all ${
                  isSelected
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-neutral-100 shadow-md ring-1 ring-emerald-500/30'
                    : 'bg-neutral-950/80 border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`font-mono text-xs font-bold ${isSelected ? 'text-emerald-400' : 'text-neutral-300'}`}>
                    {r.race_num}R
                  </span>
                  <span className="text-[10px] px-1 py-0.2 rounded bg-neutral-800 text-neutral-300">
                    {r.grade}
                  </span>
                </div>
                <div className="text-[10px] text-neutral-500 flex items-center gap-1 mt-0.5">
                  <span>{r.venue_name}</span>
                  {hasBets ? (
                    <span className="text-emerald-400 font-mono">◎{honmeiCar} ({pred.bets.length}点)</span>
                  ) : (
                    <span className="text-neutral-600">未計算</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Main Race Header & AI Prediction Control Strip */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-neutral-100">
                  {selectedRace?.venue_name}競輪場 {selectedRace?.race_num}R
                </h3>
                <span className="px-2 py-0.5 rounded text-[11px] bg-neutral-800 font-semibold text-neutral-300 border border-neutral-700">
                  {selectedRace?.grade}
                </span>
                <span className="text-xs font-mono text-neutral-400">
                  周長: {selectedRace?.distance}m / 天候: {selectedRace?.weather} / 風: {selectedRace?.wind_speed}m/s
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                AI展開予想 & 最適資金配分買い目エンジン (HistGradientBoosting + Plackett-Luce + ケリー)
              </p>
            </div>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-lg border border-neutral-800 text-xs">
            <button
              onClick={() => setActiveViewMode('table')}
              className={`px-3 py-1 rounded transition-colors font-medium ${
                activeViewMode === 'table' ? 'bg-neutral-800 text-emerald-400 shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              買い目一覧 (Table)
            </button>
            <button
              onClick={() => setActiveViewMode('formation')}
              className={`px-3 py-1 rounded transition-colors font-medium ${
                activeViewMode === 'formation' ? 'bg-neutral-800 text-emerald-400 shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              フォーメーション (Cards)
            </button>
            <button
              onClick={() => setActiveViewMode('card')}
              className={`px-3 py-1 rounded transition-colors font-medium ${
                activeViewMode === 'card' ? 'bg-neutral-800 text-emerald-400 shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              出走表・並び (Race Card)
            </button>
          </div>
        </div>

        {/* Prediction Parameter Controls */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 text-xs">
          {/* Bet Type */}
          <div>
            <label className="text-neutral-400 block mb-1 font-medium">券種 (Bet Type)</label>
            <select
              value={betType}
              onChange={e => setBetType(e.target.value as BetType)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 font-mono text-neutral-200 focus:border-emerald-500 focus:outline-none"
            >
              <option value="trifecta">3連単 (Trifecta)</option>
              <option value="exacta">2車単 (Exacta)</option>
              <option value="trio">3連複 (Trio)</option>
              <option value="quinella">2車複 (Quinella)</option>
              <option value="wide">ワイド (Wide)</option>
            </select>
          </div>

          {/* Bankroll */}
          <div>
            <label className="text-neutral-400 block mb-1 font-medium">総資金 (円)</label>
            <input
              type="number"
              value={bankroll}
              onChange={e => setBankroll(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 font-mono text-neutral-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Kelly Fraction */}
          <div>
            <label className="text-neutral-400 block mb-1 font-medium">ケリー係数 (f*)</label>
            <input
              type="text"
              value={kellyFrac}
              onChange={e => setKellyFrac(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 font-mono text-neutral-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Min EV */}
          <div>
            <label className="text-neutral-400 block mb-1 font-medium">最小期待値 (EV)</label>
            <input
              type="text"
              value={minEvFilter}
              onChange={e => setMinEvFilter(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 font-mono text-neutral-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Direct Trigger Action Buttons */}
          <div className="col-span-2 sm:col-span-4 md:col-span-1 flex items-end">
            <button
              onClick={handleMathPredict}
              disabled={isAiLoading}
              className="w-full px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 text-neutral-200 rounded-lg border border-neutral-700 flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              <Calculator className="w-3.5 h-3.5 text-emerald-400" />
              条件で再計算
            </button>
          </div>
        </div>

        {/* Big Action Buttons Row */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800/80">
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleAiPredict}
              disabled={isAiLoading}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 active:from-emerald-600 active:to-teal-500 text-neutral-950 text-xs font-extrabold rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              <Bot className={`w-4 h-4 ${isAiLoading ? 'animate-spin' : ''}`} />
              {isAiLoading ? 'Gemini AIで分析中...' : '🤖 Gemini AIで深く展開予想 & 買い目を決定'}
            </button>

            <button
              onClick={handleBatchPredictAll}
              className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-lg border border-neutral-700 flex items-center gap-1.5 transition-colors"
            >
              <Zap className="w-4 h-4 text-amber-400" />
              本日全12レース一括予想
            </button>
          </div>

          {currentPred && currentPred.bets.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyBetSlip}
                className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium rounded-lg border border-neutral-700 flex items-center gap-1.5 transition-colors"
                title="投票サイト貼り付け用テキストをコピー"
              >
                {copiedToast ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-neutral-400" />}
                {copiedToast ? 'コピー完了！' : '買い目をコピー'}
              </button>

              <button
                onClick={handleDownloadCsv}
                className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium rounded-lg border border-neutral-700 flex items-center gap-1.5 transition-colors"
                title="買い目CSVダウンロード"
              >
                <Download className="w-3.5 h-3.5 text-neutral-400" />
                CSV
              </button>

              <button
                onClick={handleSendToAutoBet}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-neutral-950 font-bold text-xs rounded-lg flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20"
                title="この買い目を自動投票キューに投入して即時実行"
              >
                <Send className="w-3.5 h-3.5" />
                この買い目で自動投票
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3. Line Battle Visualization (並び・ライン構成) */}
      {selectedRace && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 space-y-2">
          <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span>ライン構成 & 先頭主導権予想</span>
            </div>
            <span className="text-[10px] text-neutral-500 font-mono">
              バンク周長: {selectedRace.distance}m · 逃: 先行逃げ切り / 捲: カマシ捲り / 追: マーク追走
            </span>
          </div>

          <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800/80 flex flex-wrap items-center gap-6">
            {(selectedRace.lines || []).map((l, lIdx) => (
              <div key={lIdx} className="flex items-center gap-1.5 bg-neutral-900/80 px-3 py-2 rounded-lg border border-neutral-800">
                <span className="text-[11px] font-mono text-neutral-400 mr-1">ライン{lIdx + 1}:</span>
                {l.cars.map((cNo, cIdx) => {
                  const rider = selectedRace.riders.find(r => r.car_no === cNo);
                  const livery = CAR_COLORS[cNo] || { bg: '#333', text: '#fff', border: '#555' };
                  return (
                    <React.Fragment key={cNo}>
                      <div className="flex items-center gap-1">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[11px] shadow-sm"
                          style={{ backgroundColor: livery.bg, color: livery.text, border: `1px solid ${livery.border}` }}
                        >
                          {cNo}
                        </div>
                        <span className="text-xs font-medium text-neutral-200">
                          {rider?.rider_name?.split(' ')[0] || `${cNo}番`}
                        </span>
                        <span className="text-[10px] text-neutral-400 font-mono">
                          ({rider?.style || '追'})
                        </span>
                      </div>
                      {cIdx < l.cars.length - 1 && (
                        <span className="text-neutral-600 font-bold px-0.5">-</span>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. AI Marks & Tactical Breakdown (AI予想印 & 展開見解) */}
      {aiAnalysis && (
        <div className="bg-gradient-to-b from-neutral-900 to-neutral-950 border border-emerald-500/30 rounded-lg p-4 space-y-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                <Brain className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                  <span>AI展開予想 & 総合見解</span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                    AI信頼度: {aiAnalysis.confidenceScore}%
                  </span>
                  <span className="text-[10px] text-neutral-500 font-mono">
                    [{aiAnalysis.source || 'AI Engine'}]
                  </span>
                </h4>
                <p className="text-xs text-neutral-400">
                  {selectedRace?.venue_name}競輪場 {selectedRace?.race_num}R · 展開シナリオと狙い目
                </p>
              </div>
            </div>

            <button
              onClick={handleAiPredict}
              disabled={isAiLoading}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded border border-neutral-700 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAiLoading ? 'animate-spin' : ''}`} />
              再分析
            </button>
          </div>

          {/* AI Marks Ribbon */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center justify-between">
              <span>AI推奨印 (PRO MARKS)</span>
              <span className="text-[10px] text-neutral-500">◎ 本命 / ◯ 対抗 / ▲ 単穴 / △ 連下 / ☆ 穴特注</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
              {aiAnalysis.marks.map(m => {
                const rider = selectedRace?.riders.find(r => r.car_no === m.car_no);
                const livery = CAR_COLORS[m.car_no] || { bg: '#333', text: '#fff', border: '#555' };
                return (
                  <div key={m.car_no} className="bg-neutral-900/90 border border-neutral-800 p-2.5 rounded-lg space-y-1.5 hover:border-neutral-700 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-black px-2 py-0.5 rounded ${
                        m.mark === '◎' ? 'text-rose-400 bg-rose-500/15 border border-rose-500/30' :
                        m.mark === '◯' ? 'text-amber-400 bg-amber-500/15 border border-amber-500/30' :
                        m.mark === '▲' ? 'text-blue-400 bg-blue-500/15 border border-blue-500/30' :
                        m.mark === '△' ? 'text-emerald-400 bg-emerald-500/15 border border-emerald-500/30' :
                        'text-purple-400 bg-purple-500/15 border border-purple-500/30'
                      }`}>
                        {m.mark} {m.role}
                      </span>
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs shadow-sm"
                        style={{ backgroundColor: livery.bg, color: livery.text, border: `1px solid ${livery.border}` }}
                      >
                        {m.car_no}
                      </div>
                    </div>
                    <div className="font-bold text-xs text-neutral-100 truncate">
                      {rider?.rider_name || `${m.car_no}番車`}
                    </div>
                    <div className="text-[10px] text-neutral-400 flex items-center justify-between font-mono">
                      <span>得点: {rider?.score || 0}</span>
                      <span>{rider?.style || '追'} · {rider?.gear_ratio || 3.92}</span>
                    </div>
                    <p className="text-[11px] text-neutral-400 line-clamp-2 leading-relaxed border-t border-neutral-800/80 pt-1">
                      {m.reason}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tactical Scenarios & Comment */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/80 space-y-2">
              <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                <span>展開総括 & 先行主導権争い</span>
              </div>
              <p className="text-neutral-300 leading-relaxed text-[11px]">
                {aiAnalysis.summary}
              </p>
              <div className="pt-2 text-neutral-400 leading-relaxed text-[11px] border-t border-neutral-800">
                {aiAnalysis.raceScenario}
              </div>
            </div>

            <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/80 space-y-2 flex flex-col justify-between">
              <div>
                <div className="font-semibold text-teal-400 flex items-center gap-1.5 mb-1.5">
                  <span>AI推奨フォーメーション骨子</span>
                </div>
                <div className="space-y-1.5">
                  {aiAnalysis.recommendedFormations?.map((f, fIdx) => (
                    <div key={fIdx} className="flex items-center justify-between p-2 bg-neutral-900 rounded border border-neutral-800 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-emerald-400 text-xs">{f.combo}</span>
                        <span className="text-neutral-300">· {f.type}</span>
                      </div>
                      <span className="text-neutral-400 text-[10px]">{f.oddsTarget}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-2 rounded bg-neutral-900 border border-neutral-800 text-[11px] text-neutral-400 leading-relaxed">
                💡 <strong className="text-neutral-200">バンク・環境助言:</strong> {aiAnalysis.tacticalComment}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Race Card Mode (if selected) */}
      {selectedRace && activeViewMode === 'card' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-3">
          <h4 className="text-xs font-semibold text-neutral-300">出走表詳細 (entries.csv)</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-950 text-neutral-400 font-mono border-b border-neutral-800">
                <tr>
                  <th className="py-2 px-2.5">車番</th>
                  <th className="py-2 px-3">選手名</th>
                  <th className="py-2 px-2.5">府県/級班</th>
                  <th className="py-2 px-2.5 text-right">競走得点</th>
                  <th className="py-2 px-2 text-center">脚質</th>
                  <th className="py-2 px-2 text-center">ギヤ</th>
                  <th className="py-2 px-2.5 text-right">勝率</th>
                  <th className="py-2 px-2.5 text-right">2連対率</th>
                  <th className="py-2 px-2 text-right">B数</th>
                  <th className="py-2 px-2.5 text-right">AI勝率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800 font-mono text-neutral-300">
                {selectedRace.riders.map(r => {
                  const livery = CAR_COLORS[r.car_no] || { bg: '#333', text: '#fff', border: '#555' };
                  const mark = aiAnalysis?.marks.find(m => m.car_no === r.car_no)?.mark;
                  return (
                    <tr key={r.car_no} className="hover:bg-neutral-800/50">
                      <td className="py-2 px-2.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs"
                            style={{ backgroundColor: livery.bg, color: livery.text, border: `1px solid ${livery.border}` }}
                          >
                            {r.car_no}
                          </span>
                          {mark && (
                            <span className="font-bold text-amber-400">{mark}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 font-semibold text-neutral-100 font-sans">
                        {r.rider_name}
                      </td>
                      <td className="py-2 px-2.5 text-neutral-400 font-sans">
                        {r.prefecture} / {r.grade_class}
                      </td>
                      <td className="py-2 px-2.5 text-right font-bold text-neutral-200">
                        {r.score.toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-center font-sans">
                        <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-[10px]">
                          {r.style}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center text-neutral-400">
                        {r.gear_ratio}
                      </td>
                      <td className="py-2 px-2.5 text-right">
                        {(r.win_rate * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 px-2.5 text-right">
                        {(r.top2_rate * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 px-2.5 text-right text-neutral-400">
                        {r.back_count}
                      </td>
                      <td className="py-2 px-2.5 text-right font-bold text-emerald-400">
                        {((r.p1 || 0.1) * 100).toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Formation Cards Mode (if selected) */}
      {activeViewMode === 'formation' && aiAnalysis && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-4">
          <h4 className="text-sm font-bold text-neutral-200 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>AI印フォーメーション展開</span>
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Main Line Formation */}
            <div className="bg-neutral-950 p-4 rounded-lg border border-emerald-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-300">
                  本線（スジ決着フォーメーション）
                </span>
                <span className="text-xs font-mono text-neutral-400">推奨4点</span>
              </div>
              <div className="p-3 bg-neutral-900 rounded border border-neutral-800 text-center font-mono text-sm space-y-1">
                <div className="text-xs text-neutral-400 font-sans">1着 ⇄ 2着 → 3着</div>
                <div className="text-emerald-400 font-bold text-base">
                  ◎ {aiAnalysis.marks.find(m => m.mark === '◎')?.car_no} ⇄ ◯ {aiAnalysis.marks.find(m => m.mark === '◯')?.car_no} → ▲ {aiAnalysis.marks.find(m => m.mark === '▲')?.car_no}, △ {aiAnalysis.marks.find(m => m.mark === '△')?.car_no}
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                ◎本命車が主導権を握り、番手◯が追走。直線での差し返しまたは順走でスジ決着する手堅いフォーメーション。
              </p>
            </div>

            {/* 2. Rival / Sashi Formation */}
            <div className="bg-neutral-950 p-4 rounded-lg border border-blue-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-500/20 text-blue-300">
                  対抗（番手逆転・差しフォーメーション）
                </span>
                <span className="text-xs font-mono text-neutral-400">推奨4点</span>
              </div>
              <div className="p-3 bg-neutral-900 rounded border border-neutral-800 text-center font-mono text-sm space-y-1">
                <div className="text-xs text-neutral-400 font-sans">1着 → 2着 → 3着</div>
                <div className="text-blue-400 font-bold text-base">
                  ◯ {aiAnalysis.marks.find(m => m.mark === '◯')?.car_no} → ◎ {aiAnalysis.marks.find(m => m.mark === '◎')?.car_no} → ▲, △, ☆
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                先行選手が力尽きるか番手が鋭く交わすパターン。好配当が期待できる中穴狙い。
              </p>
            </div>

            {/* 3. Dark Horse / Makuri Formation */}
            <div className="bg-neutral-950 p-4 rounded-lg border border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-300">
                  穴狙い（別線強襲・高配当）
                </span>
                <span className="text-xs font-mono text-neutral-400">推奨4点</span>
              </div>
              <div className="p-3 bg-neutral-900 rounded border border-neutral-800 text-center font-mono text-sm space-y-1">
                <div className="text-xs text-neutral-400 font-sans">1着 → 2着 → 3着</div>
                <div className="text-amber-400 font-bold text-base">
                  ▲ {aiAnalysis.marks.find(m => m.mark === '▲')?.car_no} → ◎, ◯ → 全
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                先行叩き合いで本命ラインが共倒れし、別線のカマシ捲りが炸裂する万車券・超高配当パターン。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 7. AI Recommended Bets Table & Output ("AI予測で買い目を出して") */}
      {currentPred && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shadow-xl">
          {/* Header Status Bar */}
          <div className="px-4 py-3 bg-neutral-900/90 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h4 className="text-sm font-bold text-neutral-100 font-mono">
                {currentPred.race_id}
              </h4>
              <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                currentPred.decision.includes('買い目あり')
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
              }`}>
                {currentPred.decision}
              </span>
              <span className="text-xs font-mono text-neutral-400">
                券種: <strong className="text-neutral-200">{BET_LABELS[currentPred.bet_type]}</strong>
              </span>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 text-xs">
              <span className="text-neutral-500 mr-1 text-[11px]">区分絞り込み:</span>
              {[
                { id: 'all', label: `すべて (${currentPred.bets.length})` },
                { id: '本線', label: '本線（スジ）' },
                { id: '対抗', label: '対抗（差し）' },
                { id: '穴', label: '穴目・特注' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setCategoryFilter(f.id)}
                  className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                    categoryFilter === f.id
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold'
                      : 'text-neutral-400 hover:text-neutral-200 bg-neutral-950 border border-neutral-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table of Recommended Bets */}
          <div className="p-3">
            {displayedBets.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-500 space-y-3">
                <AlertCircle className="w-5 h-5 mx-auto text-neutral-600 mb-1" />
                <div>条件に合致する買い目がありません。</div>
                <div className="flex justify-center gap-2">
                  <button
                    onClick={handleAiPredict}
                    className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold rounded text-xs transition-colors"
                  >
                    🤖 AI予想で買い目を自動算出する
                  </button>
                  <button
                    onClick={handleMathPredict}
                    className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-xs transition-colors"
                  >
                    ⚡ 数理モデルで再計算
                  </button>
                </div>
              </div>
            ) : (
              <div className="border border-neutral-800 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-neutral-950 text-neutral-400 font-mono border-b border-neutral-800">
                    <tr>
                      <th className="py-2.5 px-3">区分</th>
                      <th className="py-2.5 px-3">買い目</th>
                      <th className="py-2.5 px-3">AI展開・狙い目</th>
                      <th className="py-2.5 px-3 text-right">推定確率</th>
                      <th className="py-2.5 px-3 text-right">損益分岐</th>
                      <th className="py-2.5 px-3 text-right">市場オッズ</th>
                      <th className="py-2.5 px-3 text-right">期待値 (EV)</th>
                      <th className="py-2.5 px-3 text-right">推奨賭け金</th>
                      <th className="py-2.5 px-3 text-right">想定払戻</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800 font-mono text-neutral-300">
                    {displayedBets.map((b, idx) => {
                      const isHighEv = (b.ev || 0) >= 1.25;
                      const category = b.category || (idx < 2 ? '本線（スジ）' : idx < 4 ? '対抗（差し）' : '穴目（強襲）');
                      const reason = b.reason || '';
                      const stakeYen = b.stake || 500;
                      const potentialPayout = Math.round(stakeYen * (b.odds || 1));

                      // Parse car livery pills for combo
                      const carPills = b.combo.split('-').map(Number);

                      return (
                        <tr
                          key={`${b.combo}-${idx}`}
                          className={`hover:bg-neutral-800/50 transition-colors ${
                            isHighEv ? 'bg-emerald-950/20' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold ${
                              category.includes('本線') ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                              category.includes('対抗') ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                              category.includes('穴') || category.includes('特注') ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                              'bg-neutral-800 text-neutral-400'
                            }`}>
                              {category}
                            </span>
                          </td>

                          {/* Combo display with livery badges */}
                          <td className="py-2.5 px-3 font-semibold text-neutral-100">
                            <div className="flex items-center gap-1.5">
                              <span className="text-neutral-500 font-sans text-[10px] mr-0.5">{BET_LABELS[b.bet_type]}</span>
                              {carPills.map((cNo, pIdx) => {
                                const livery = CAR_COLORS[cNo] || { bg: '#333', text: '#fff', border: '#555' };
                                return (
                                  <React.Fragment key={pIdx}>
                                    <span
                                      className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs shadow-sm"
                                      style={{ backgroundColor: livery.bg, color: livery.text, border: `1px solid ${livery.border}` }}
                                    >
                                      {cNo}
                                    </span>
                                    {pIdx < carPills.length - 1 && (
                                      <span className="text-neutral-500 font-bold">-</span>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          </td>

                          {/* Reason */}
                          <td className="py-2.5 px-3 font-sans text-[11px] text-neutral-300 max-w-xs truncate" title={reason}>
                            {reason || `${b.combo.split('-')[0]}番車の主導権展開`}
                          </td>

                          {/* Probability */}
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            {(b.prob * 100).toFixed(2)}%
                          </td>

                          {/* Breakeven Odds */}
                          <td className="py-2.5 px-3 text-right tabular-nums text-neutral-400">
                            {b.breakeven_odds.toFixed(1)}倍
                          </td>

                          {/* Market Odds */}
                          <td className="py-2.5 px-3 text-right tabular-nums font-bold text-neutral-100">
                            {b.odds?.toFixed(1)}倍
                          </td>

                          {/* EV */}
                          <td className="py-2.5 px-3 text-right tabular-nums font-extrabold text-emerald-400">
                            {b.ev?.toFixed(2)}
                          </td>

                          {/* Kelly Stake */}
                          <td className="py-2.5 px-3 text-right tabular-nums font-bold text-emerald-300 text-sm">
                            ¥{stakeYen.toLocaleString()}円
                          </td>

                          {/* Potential Payout */}
                          <td className="py-2.5 px-3 text-right tabular-nums font-mono text-neutral-400">
                            ¥{potentialPayout.toLocaleString()}円
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Total Staked Summary Strip */}
            {displayedBets.length > 0 && (
              <div className="mt-3 p-3 bg-neutral-950 rounded-lg border border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-neutral-300 font-sans font-medium">推奨買い目サマリー</span>
                  <span className="text-neutral-500">（分数ケリー f*={kellyFrac}）</span>
                </div>

                <div className="flex items-center gap-6">
                  <div>
                    <span className="text-neutral-500 font-sans text-[11px]">推奨点数: </span>
                    <strong className="text-neutral-200">{displayedBets.length}点</strong>
                  </div>
                  <div>
                    <span className="text-neutral-500 font-sans text-[11px]">平均期待値: </span>
                    <strong className="text-emerald-400">{avgEv}倍</strong>
                  </div>
                  <div>
                    <span className="text-neutral-500 font-sans text-[11px]">最高配当: </span>
                    <strong className="text-amber-400">{maxOdds.toFixed(1)}倍</strong>
                  </div>
                  <div className="text-sm">
                    <span className="text-neutral-400 font-sans text-xs">合計投資額: </span>
                    <strong className="text-emerald-400 font-extrabold">¥{totalStake.toLocaleString()}円</strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 8. Batch 12-Race Prediction Modal (本日全12レース一括買い目マトリクス) */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-100">
                    本日全12レース 一括AI予想 & 推奨買い目マトリクス
                  </h3>
                  <p className="text-xs text-neutral-400">
                    券種: {BET_LABELS[betType]} · 全レースのAI本命印と推奨買い目を集約
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsBatchModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-200 p-1.5 rounded-lg hover:bg-neutral-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1 scrollbar-thin">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {predictions.map(pred => {
                  const race = races.find(r => r.race_id === pred.race_id);
                  const honmei = pred.aiAnalysis?.marks.find(m => m.mark === '◎');
                  const topBets = pred.bets.slice(0, 3);
                  const raceStake = pred.bets.reduce((s, b) => s + (b.stake || 0), 0);

                  return (
                    <div
                      key={pred.race_id}
                      onClick={() => {
                        setSelectedRaceId(pred.race_id);
                        setIsBatchModalOpen(false);
                      }}
                      className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg hover:border-emerald-500/50 cursor-pointer transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-emerald-400 font-mono">{race?.venue_name} {race?.race_num}R</span>
                          <span className="px-1.5 py-0.2 rounded bg-neutral-800 text-[10px] text-neutral-300">{race?.grade}</span>
                        </div>
                        <span className="font-mono text-neutral-400 text-[11px]">
                          本命: ◎{honmei?.car_no}番車 ({((honmei ? race?.riders.find(r => r.car_no === honmei.car_no)?.p1 || 0.2 : 0.2) * 100).toFixed(0)}%)
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {topBets.map((b, bIdx) => (
                          <span key={bIdx} className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 font-mono text-[11px] text-neutral-200">
                            {b.combo} <strong className="text-emerald-400">¥{(b.stake || 0).toLocaleString()}</strong>
                          </span>
                        ))}
                        {pred.bets.length > 3 && (
                          <span className="text-[10px] text-neutral-500">他{pred.bets.length - 3}点</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-neutral-900 text-[11px] text-neutral-400">
                        <span>計 {pred.bets.length}点</span>
                        <span className="text-emerald-300 font-bold font-mono">合計 ¥{raceStake.toLocaleString()}円</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-between">
              <div className="text-xs text-neutral-400">
                本日12レース合計推奨投資額:{' '}
                <strong className="text-emerald-400 text-sm font-mono">
                  ¥{predictions.reduce((sum, p) => sum + p.bets.reduce((s, b) => s + (b.stake || 0), 0), 0).toLocaleString()}円
                </strong>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsBatchModalOpen(false)}
                  className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs rounded-lg transition-colors"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
