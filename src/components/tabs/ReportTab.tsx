import React, { useState } from 'react';
import { FileText, Download, Printer, Copy, Check, ExternalLink, Calendar, CheckCircle2 } from 'lucide-react';
import { Race, OddsItem, BacktestReport, BetType, BET_LABELS } from '../../types';
import { computeComboProbs, allocateKelly } from '../../utils/keirinMath';

interface ReportTabProps {
  races: Race[];
  oddsList: OddsItem[];
  backtestReport: BacktestReport | null;
  onLog: (msg: string, type?: 'info' | 'warn' | 'error' | 'success') => void;
}

export const ReportTab: React.FC<ReportTabProps> = ({
  races,
  oddsList,
  backtestReport,
  onLog,
}) => {
  const [reportDate, setReportDate] = useState('2026-10-10');
  const [bankroll, setBankroll] = useState('100000');
  const [kellyFrac, setKellyFrac] = useState('0.25');
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [generatedCsv, setGeneratedCsv] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Generate Daily Report HTML + CSV
  const handleGenerateReport = () => {
    onLog(`日次レポート (${reportDate}) の生成を開始...`, 'info');

    const bRoll = parseFloat(bankroll) || 100000;
    const kFrac = parseFloat(kellyFrac) || 0.25;

    // Filter races for date
    const targetRaces = races.slice(0, 8); // take today's races
    const reportRows: Array<{
      race_id: string;
      venue_name: string;
      race_num: number;
      decision: string;
      win: { car_no: number; prob: number }[];
      bets: Array<{ combo: string; prob: number; be: number; odds: number; ev: number; stake: number }>;
    }> = [];

    const csvRows: Array<{
      race_id: string;
      bet_type: string;
      combo: string;
      prob: number;
      breakeven_odds: number;
      odds: number;
      ev: number;
      stake: number;
    }> = [];

    let totalStaked = 0;
    let buyRaceCount = 0;

    targetRaces.forEach(r => {
      const cars = r.riders.map(rd => rd.car_no);
      const p1Arr = r.riders.map(rd => rd.p1 || 1 / cars.length);
      const p2Arr = r.riders.map(rd => rd.p2 || p1Arr[rd.car_no - 1]);
      const p3Arr = r.riders.map(rd => rd.p3 || p1Arr[rd.car_no - 1]);

      const combos = computeComboProbs(cars, p1Arr, p2Arr, p3Arr).filter(c => c.bet_type === 'trifecta');
      const oddsMap = new Map<string, number>();
      oddsList
        .filter(o => o.race_id === r.race_id && o.bet_type === 'trifecta')
        .forEach(o => oddsMap.set(o.combo, o.odds));

      const evBets = combos
        .map(c => {
          const odds = oddsMap.get(c.combo) || Math.round((0.75 / Math.max(c.prob, 0.001)) * 10) / 10;
          const be = Math.round((1.0 / Math.max(c.prob, 0.0001)) * 10) / 10;
          const ev = Math.round((c.prob * odds) * 100) / 100;
          return { combo: c.combo, prob: c.prob, be, odds, ev, stake: 0 };
        })
        .filter(b => b.ev >= 1.2 && b.prob >= 0.02)
        .sort((a, b) => b.ev - a.ev)
        .slice(0, 3);

      if (evBets.length > 0) {
        const stakes = allocateKelly(
          evBets.map(b => ({ prob: b.prob, odds: b.odds })),
          bRoll,
          kFrac
        );
        evBets.forEach((b, idx) => {
          b.stake = stakes[idx];
          if (b.stake > 0) {
            totalStaked += b.stake;
            csvRows.push({
              race_id: r.race_id,
              bet_type: 'trifecta',
              combo: b.combo,
              prob: b.prob,
              breakeven_odds: b.be,
              odds: b.odds,
              ev: b.ev,
              stake: b.stake,
            });
          }
        });
      }

      const hasBuy = evBets.some(b => b.stake > 0);
      if (hasBuy) buyRaceCount++;

      reportRows.push({
        race_id: r.race_id,
        venue_name: r.venue_name,
        race_num: r.race_num,
        decision: hasBuy ? '買い目あり' : '見送り（戦略条件を満たす買い目なし）',
        win: r.riders.map(rd => ({ car_no: rd.car_no, prob: rd.p1 || 0 })).sort((a, b) => b.prob - a.prob).slice(0, 5),
        bets: evBets.filter(b => b.stake > 0),
      });
    });

    // Build HTML string
    const test = backtestReport?.test;
    const testInfo = test
      ? `<p style="font-size: 13px; color: #444; margin-bottom: 12px;">バックテスト(テスト期間): 回収率 <strong>${(test.roi * 100).toFixed(1)}%</strong>（95%区間 ${(test.ci95[0] * 100).toFixed(1)}%〜${(test.ci95[1] * 100).toFixed(1)}%）／的中率 <strong>${(test.hit_rate * 100).toFixed(1)}%</strong>／${test.n_bets}点</p>`
      : '';

    const htmlContent = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>競輪AI 日次レポート ${reportDate}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Kaku Gothic ProN", Meiryo, sans-serif; margin: 28px auto; max-width: 900px; color: #222; line-height: 1.5; }
h1 { font-size: 22px; border-bottom: 2px solid #10b981; padding-bottom: 6px; margin-bottom: 14px; }
h2 { font-size: 16px; margin-top: 24px; margin-bottom: 8px; }
small.buy { color: #047857; font-weight: bold; margin-left: 8px; font-size: 12px; }
small.skip { color: #b91c1c; font-weight: normal; margin-left: 8px; font-size: 12px; }
table { border-collapse: collapse; margin: 6px 0 16px; width: 100%; max-width: 650px; font-size: 12px; }
td, th { border: 1px solid #d1d5db; padding: 5px 10px; text-align: right; }
th { background: #f3f4f6; text-align: left; }
.warn { background: #fffbeb; padding: 10px 14px; border-left: 4px solid #f59e0b; font-size: 12px; color: #92400e; margin: 12px 0; }
.summary-bar { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px 16px; font-size: 13px; font-weight: bold; color: #166534; margin-top: 20px; border-radius: 4px; }
</style>
</head>
<body>
<h1>競輪AI 日次レポート ${reportDate}</h1>
${testInfo}
<div class="warn">本レポートは利益を保証しません。購入は自己責任で、余裕資金の範囲で行ってください。</div>

${reportRows.map(r => `
<h2>${r.venue_name} ${r.race_num}R <small style="color: #6b7280; font-size: 12px;">(${r.race_id})</small> <small class="${r.decision.startsWith('買い目あり') ? 'buy' : 'skip'}">${r.decision}</small></h2>
<table>
  <tr><th style="width: 80px;">車番</th>${r.win.map(w => `<td>${w.car_no}</td>`).join('')}</tr>
  <tr><th>1着確率</th>${r.win.map(w => `<td>${(w.prob * 100).toFixed(1)}%</td>`).join('')}</tr>
</table>
${r.bets.length > 0 ? `
<b>3連単 (Trifecta)</b>
<table>
  <tr>
    <th style="text-align: left;">買い目</th>
    <th>確率</th>
    <th>損益分岐</th>
    <th>オッズ</th>
    <th>期待値</th>
    <th>賭け金</th>
  </tr>
  ${r.bets.map(b => `
  <tr>
    <td style="text-align: left; font-weight: bold;">${b.combo}</td>
    <td>${(b.prob * 100).toFixed(2)}%</td>
    <td>${b.be.toFixed(1)}倍</td>
    <td>${b.odds.toFixed(1)}倍</td>
    <td>${b.ev.toFixed(2)}</td>
    <td style="color: #047857; font-weight: bold;">¥${b.stake.toLocaleString()}円</td>
  </tr>
  `).join('')}
</table>
` : ''}
`).join('')}

<div class="summary-bar">
  買い目ありレース: ${buyRaceCount} / ${targetRaces.length}　合計推奨賭け金: ¥${totalStaked.toLocaleString()}円
</div>
</body>
</html>`;

    // Build CSV string
    const csvHeaders = ['race_id', 'bet_type', 'combo', 'prob', 'breakeven_odds', 'odds', 'ev', 'stake'];
    const csvLines = [csvHeaders.join(',')];
    csvRows.forEach(c => {
      csvLines.push([
        c.race_id,
        c.bet_type,
        c.combo,
        c.prob.toFixed(4),
        c.breakeven_odds.toFixed(1),
        c.odds.toFixed(1),
        c.ev.toFixed(2),
        c.stake,
      ].join(','));
    });

    setGeneratedHtml(htmlContent);
    setGeneratedCsv(csvLines.join('\n'));
    onLog(`日次レポート出力完了: reports/daily_${reportDate.replace(/-/g, '')}.html, daily_${reportDate.replace(/-/g, '')}.csv`, 'success');
  };

  const handleDownloadHtml = () => {
    if (!generatedHtml) return;
    const blob = new Blob([generatedHtml], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily_${reportDate.replace(/-/g, '')}.html`;
    a.click();
    URL.revokeObjectURL(url);
    onLog(`daily_${reportDate.replace(/-/g, '')}.html をダウンロードしました。`, 'success');
  };

  const handleDownloadCsv = () => {
    if (!generatedCsv) return;
    const blob = new Blob([generatedCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily_${reportDate.replace(/-/g, '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onLog(`daily_${reportDate.replace(/-/g, '')}.csv をダウンロードしました。`, 'success');
  };

  const handleCopyHtml = () => {
    if (!generatedHtml) return;
    navigator.clipboard.writeText(generatedHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Parameter Ribbon */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
          <FileText className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-neutral-200">
            日次レポート出力設定 (HTML + CSV)
          </h3>
        </div>

        <p className="text-xs text-neutral-400">
          出走表・オッズ・機械学習モデル・資金配分（分数ケリー）の設定に基づき、日次レポートを生成します。
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="text-neutral-400 block mb-1">対象日付</label>
            <input
              type="date"
              value={reportDate}
              onChange={e => setReportDate(e.target.value)}
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
            <label className="text-neutral-400 block mb-1">ケリー係数</label>
            <input
              type="text"
              value={kellyFrac}
              onChange={e => setKellyFrac(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 font-mono text-neutral-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={handleGenerateReport}
            className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-neutral-950 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all shadow-md shadow-emerald-500/10"
          >
            <FileText className="w-4 h-4" />
            日次レポートを作成して開く
          </button>

          {generatedHtml && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadHtml}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs rounded border border-neutral-700 flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                HTML保存
              </button>
              <button
                onClick={handleDownloadCsv}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs rounded border border-neutral-700 flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                CSV保存
              </button>
              <button
                onClick={handleCopyHtml}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs rounded border border-neutral-700 flex items-center gap-1.5 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'コピー完了' : 'HTMLコピー'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Live Preview Container */}
      {generatedHtml && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
            <span className="font-semibold text-neutral-200">生成プレビュー (HTML Preview)</span>
            <span className="font-mono text-[11px]">daily_{reportDate.replace(/-/g, '')}.html</span>
          </div>
          <div className="p-4 bg-white text-neutral-900 overflow-y-auto max-h-[500px]">
            <iframe
              srcDoc={generatedHtml}
              title="Daily Report Preview"
              className="w-full h-96 border-none"
            />
          </div>
        </div>
      )}
    </div>
  );
};
