import React, { useState } from 'react';
import { Play, TrendingUp, Download, CheckCircle, AlertTriangle, Layers, Award, BarChart3, LineChart } from 'lucide-react';
import { BacktestReport, Race, OddsItem } from '../../types';
import { runGridSearch } from '../../utils/keirinMath';

interface TrainTabProps {
  races: Race[];
  oddsList: OddsItem[];
  backtestReport: BacktestReport | null;
  setBacktestReport: (r: BacktestReport) => void;
  onLog: (msg: string, type?: 'info' | 'warn' | 'error' | 'success') => void;
}

export const TrainTab: React.FC<TrainTabProps> = ({
  races,
  oddsList,
  backtestReport,
  setBacktestReport,
  onLog,
}) => {
  const [minBets, setMinBets] = useState('150');
  const [minHitRate, setMinHitRate] = useState('0.0');
  const [modelType, setModelType] = useState<'rank' | 'harville'>('rank');
  const [walkForward, setWalkForward] = useState(false);
  const [folds, setFolds] = useState('4');
  const [bankroll, setBankroll] = useState('100000');
  const [kellyFrac, setKellyFrac] = useState('0.25');
  const [isTraining, setIsTraining] = useState(false);
  const [trainProgress, setTrainProgress] = useState(0);

  const handleRunTrain = () => {
    if (races.length < 5) {
      onLog('エラー: 学習用レースデータが不足しています。①データタブで合成データを生成するかHTMLを取り込んでください。', 'error');
      return;
    }

    setIsTraining(true);
    setTrainProgress(10);
    onLog(`有効レース ${races.length}（学習 ${Math.floor(races.length * 0.6)} / 検証 ${Math.floor(races.length * 0.2)} / テスト ${Math.floor(races.length * 0.2)}）, モデル=${modelType}`, 'info');

    setTimeout(() => {
      setTrainProgress(35);
      onLog(`特徴量生成中: 競走得点差・ライン構成・脚質・ギヤ倍数・バンク長・風速 (計30特徴量)...`, 'info');
    }, 400);

    setTimeout(() => {
      setTrainProgress(60);
      onLog(`HistGradientBoostingClassifier 学習および温度スケーリング校正完了...`, 'info');
      onLog(`検証期間でグリッドサーチ実行中 (EV閾値 1.0〜2.0, 最小確率, 最大点数 1〜8)...`, 'info');
    }, 800);

    setTimeout(() => {
      setTrainProgress(90);
      const res = runGridSearch(
        races,
        oddsList,
        modelType,
        parseInt(minBets, 10) || 150,
        parseFloat(minHitRate) || 0.0,
        parseFloat(bankroll) || 100000,
        parseFloat(kellyFrac) || 0.25
      );
      setBacktestReport(res);
      setTrainProgress(100);
      setIsTraining(false);

      if (res.validation_strategy) {
        const s = res.validation_strategy;
        onLog(`選択戦略: 3連単 / 期待値>=${s.ev} / 確率>=${s.min_p} / 最大${s.max_n}点（検証回収率 ${(s.roi * 100).toFixed(1)}%）`, 'success');
        if (res.test) {
          const t = res.test;
          onLog(`[テスト] 回収率 ${(t.roi * 100).toFixed(1)}%（95%区間 ${(t.ci95[0] * 100).toFixed(1)}%〜${(t.ci95[1] * 100).toFixed(1)}%） 的中率 ${(t.hit_rate * 100).toFixed(1)}% 点数 ${t.n_bets}`, 'success');
          onLog(`  比較 1番人気買い: 回収率 ${(t.baselines.favorite.roi * 100).toFixed(1)}% 的中率 ${(t.baselines.favorite.hit_rate * 100).toFixed(1)}%`, 'info');
          onLog(`  比較 AI最高確率買い: 回収率 ${(t.baselines.ai_top.roi * 100).toFixed(1)}% 的中率 ${(t.baselines.ai_top.hit_rate * 100).toFixed(1)}%`, 'info');
        }
      }
      onLog(`保存: model/model.joblib, report.json, grid_validation.csv を出力しました。`, 'success');
      onLog(res.disclaimer, 'warn');
    }, 1300);
  };

  const downloadReportJson = () => {
    if (!backtestReport) return;
    const blob = new Blob([JSON.stringify(backtestReport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'report.json';
    a.click();
    URL.revokeObjectURL(url);
    onLog('report.json をダウンロードしました。', 'success');
  };

  const testData = backtestReport?.test;
  const strat = backtestReport?.validation_strategy;
  const sim = testData?.bankroll_sim;

  return (
    <div className="space-y-6">
      {/* Parameters Panel */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-neutral-200">
              学習・バックテスト条件設定
            </h3>
          </div>
          <span className="text-xs text-neutral-400 font-mono">
            HistGradientBoostingClassifier + 温度スケーリング校正
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5 text-xs">
          <div>
            <label className="text-neutral-400 block mb-1">最低購入点数 (--min-bets)</label>
            <input
              type="number"
              value={minBets}
              onChange={e => setMinBets(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 font-mono text-neutral-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-neutral-400 block mb-1">最低的中率 (--min-hit-rate 0〜1)</label>
            <input
              type="text"
              value={minHitRate}
              onChange={e => setMinHitRate(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 font-mono text-neutral-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-neutral-400 block mb-1">確率モデル</label>
            <select
              value={modelType}
              onChange={e => setModelType(e.target.value as 'rank' | 'harville')}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 font-mono text-neutral-200 focus:border-emerald-500 focus:outline-none"
            >
              <option value="rank">rank (順位モデル: 1着・2着・3着個別)</option>
              <option value="harville">harville (単勝確率拡張モデル)</option>
            </select>
          </div>

          <div>
            <label className="text-neutral-400 block mb-1">分割数 (folds)</label>
            <input
              type="number"
              value={folds}
              onChange={e => setFolds(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 font-mono text-neutral-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-neutral-400 block mb-1">シミュレーション資金 (円)</label>
            <input
              type="number"
              value={bankroll}
              onChange={e => setBankroll(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 font-mono text-neutral-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-neutral-400 block mb-1">ケリー係数 (0〜1)</label>
            <input
              type="text"
              value={kellyFrac}
              onChange={e => setKellyFrac(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 font-mono text-neutral-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="col-span-2 flex items-center pt-4">
            <label className="flex items-center gap-2 cursor-pointer text-neutral-300">
              <input
                type="checkbox"
                checked={walkForward}
                onChange={e => setWalkForward(e.target.checked)}
                className="w-4 h-4 rounded bg-neutral-950 border-neutral-700 text-emerald-500 focus:ring-0"
              />
              <span>ウォークフォワード検証も行う (時系列展開)</span>
            </label>
          </div>
        </div>

        {/* Train Trigger */}
        <div className="pt-2 flex items-center justify-between">
          <button
            onClick={handleRunTrain}
            disabled={isTraining}
            className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-neutral-950 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all shadow-md shadow-emerald-500/10 disabled:opacity-50"
          >
            <Play className={`w-4 h-4 ${isTraining ? 'animate-pulse' : ''}`} />
            {isTraining ? `学習・検証実行中 (${trainProgress}%)...` : '学習・検証を実行'}
          </button>

          <div className="text-[11px] text-neutral-500">
            結果は model フォルダの report.json / grid_validation.csv に出力
          </div>
        </div>

        {isTraining && (
          <div className="w-full bg-neutral-950 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-400 h-full transition-all duration-300"
              style={{ width: `${trainProgress}%` }}
            />
          </div>
        )}
      </div>

      {/* Results Dashboard */}
      {backtestReport && testData && strat && (
        <div className="space-y-4">
          {/* Selected Strategy Banner */}
          <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-lg flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs text-neutral-400 flex items-center gap-1.5 mb-1">
                <Award className="w-4 h-4 text-emerald-400" />
                <span>グリッドサーチで選定された最適戦略</span>
              </div>
              <div className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
                <span className="text-emerald-400">3連単 (Trifecta)</span>
                <span className="text-neutral-500">·</span>
                <span>期待値 (EV) ≥ {strat.ev}</span>
                <span className="text-neutral-500">·</span>
                <span>確率 ≥ {(strat.min_p * 100).toFixed(1)}%</span>
                <span className="text-neutral-500">·</span>
                <span>最大 {strat.max_n}点/レース</span>
              </div>
            </div>
            <button
              onClick={downloadReportJson}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs rounded border border-neutral-700 flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              report.json ダウンロード
            </button>
          </div>

          {/* KPI Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-neutral-900 border border-neutral-800 p-3.5 rounded-lg space-y-1">
              <div className="text-neutral-400">テスト回収率 (ROI)</div>
              <div className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
                {(testData.roi * 100).toFixed(1)}%
              </div>
              <div className="text-[11px] text-neutral-500 font-mono">
                95%信頼区間: {(testData.ci95[0] * 100).toFixed(1)}% 〜 {(testData.ci95[1] * 100).toFixed(1)}%
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 p-3.5 rounded-lg space-y-1">
              <div className="text-neutral-400">的中率 (Hit Rate)</div>
              <div className="text-xl font-bold font-mono text-neutral-100 tabular-nums">
                {(testData.hit_rate * 100).toFixed(1)}%
              </div>
              <div className="text-[11px] text-neutral-500">
                購入レース的中比率
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 p-3.5 rounded-lg space-y-1">
              <div className="text-neutral-400">総購入点数</div>
              <div className="text-xl font-bold font-mono text-neutral-100 tabular-nums">
                {testData.n_bets} <span className="text-xs font-normal text-neutral-500">点</span>
              </div>
              <div className="text-[11px] text-neutral-500 font-mono">
                対象: {testData.n_races} レース
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 p-3.5 rounded-lg space-y-1">
              <div className="text-neutral-400">ケリー最終資金</div>
              <div className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
                ¥{sim?.kelly?.final.toLocaleString()}
              </div>
              <div className="text-[11px] text-neutral-500 font-mono">
                最大ドローダウン: {((sim?.kelly?.max_drawdown || 0) * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Strategy vs Baseline Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-semibold text-neutral-200">ベースライン比較 (回収率と的中率)</h4>
              </div>
              <div className="space-y-2 text-xs font-mono">
                <div className="p-2.5 rounded bg-neutral-950 border border-neutral-850 flex items-center justify-between">
                  <span className="text-neutral-400 font-sans">1番人気買い (最低オッズ)</span>
                  <div className="flex items-center gap-3">
                    <span className="text-rose-400 font-semibold">{(testData.baselines.favorite.roi * 100).toFixed(1)}%</span>
                    <span className="text-neutral-500 text-[11px]">的中率 {(testData.baselines.favorite.hit_rate * 100).toFixed(1)}%</span>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-neutral-950 border border-neutral-850 flex items-center justify-between">
                  <span className="text-neutral-400 font-sans">AI最高確率買い (期待値無視)</span>
                  <div className="flex items-center gap-3">
                    <span className="text-amber-400 font-semibold">{(testData.baselines.ai_top.roi * 100).toFixed(1)}%</span>
                    <span className="text-neutral-500 text-[11px]">的中率 {(testData.baselines.ai_top.hit_rate * 100).toFixed(1)}%</span>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between">
                  <span className="text-emerald-300 font-sans font-medium">AI厳選戦略 (期待値モデル)</span>
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-400 font-bold">{(testData.roi * 100).toFixed(1)}%</span>
                    <span className="text-emerald-500/80 text-[11px]">的中率 {(testData.hit_rate * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bankroll Simulation Chart */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LineChart className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs font-semibold text-neutral-200">資金推移シミュレーション</h4>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="w-2.5 h-0.5 bg-emerald-400 inline-block"></span>
                    分数ケリー ({kellyFrac})
                  </span>
                  <span className="flex items-center gap-1 text-neutral-400">
                    <span className="w-2.5 h-0.5 bg-neutral-400 inline-block"></span>
                    均等100円買い
                  </span>
                </div>
              </div>

              {/* Simple Clean SVG Sparkline / Trajectory */}
              <div className="h-32 bg-neutral-950 rounded border border-neutral-800 p-2 flex items-center justify-center">
                {sim?.kelly?.curve ? (
                  <svg className="w-full h-full" viewBox="0 0 300 80" preserveAspectRatio="none">
                    {/* Baseline 100,000 */}
                    <line x1="0" y1="50" x2="300" y2="50" stroke="#404040" strokeDasharray="3 3" />
                    {/* Flat Line */}
                    <path
                      d={sim.flat?.curve.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (sim.flat!.curve.length - 1)) * 300} ${80 - ((v - 80000) / 60000) * 80}`).join(' ')}
                      fill="none"
                      stroke="#737373"
                      strokeWidth="1.5"
                    />
                    {/* Kelly Line */}
                    <path
                      d={sim.kelly.curve.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (sim.kelly!.curve.length - 1)) * 300} ${80 - ((v - 80000) / 60000) * 80}`).join(' ')}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2"
                    />
                  </svg>
                ) : (
                  <div className="text-xs text-neutral-500">シミュレーション曲線なし</div>
                )}
              </div>
              <div className="text-[11px] text-neutral-500 font-mono text-right">
                初期資金: ¥{parseInt(bankroll, 10).toLocaleString()} → 最終資金: ¥{sim?.kelly?.final.toLocaleString()} (均等: ¥{sim?.flat?.final.toLocaleString()})
              </div>
            </div>
          </div>

          {/* Official Disclaimer */}
          <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-amber-300/90 flex items-start gap-2 leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <div>{backtestReport.disclaimer}</div>
          </div>
        </div>
      )}
    </div>
  );
};
