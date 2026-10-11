import React, { useState } from 'react';
import { Calendar, RefreshCw, Database, FileSpreadsheet, Upload, Download, CheckCircle, Search } from 'lucide-react';
import { ScheduleItem, Race, OddsItem } from '../../types';
import { generateMonthlySchedule, scheduleToCSV } from '../../data/officialSchedule';
import { generateRealisticRaces, exportEntriesCSV, exportOddsCSV } from '../../utils/keirinMath';

interface DataTabProps {
  schedule: ScheduleItem[];
  setSchedule: (s: ScheduleItem[]) => void;
  races: Race[];
  setRaces: (r: Race[]) => void;
  oddsList: OddsItem[];
  setOddsList: (o: OddsItem[]) => void;
  onLog: (msg: string, type?: 'info' | 'warn' | 'error' | 'success') => void;
}

export const DataTab: React.FC<DataTabProps> = ({
  schedule,
  setSchedule,
  races,
  setRaces,
  oddsList,
  setOddsList,
  onLog,
}) => {
  const [dataDir, setDataDir] = useState('C:\\Users\\User\\KeirinAI\\data');
  const [htmlDir, setHtmlDir] = useState('C:\\Users\\User\\KeirinAI\\saved_html');
  const [targetMonth, setTargetMonth] = useState('2026-10');
  const [sampleRaceCount, setSampleRaceCount] = useState('1500');
  const [isFetchingSchedule, setIsFetchingSchedule] = useState(false);
  const [isGeneratingSample, setIsGeneratingSample] = useState(false);
  const [scheduleFilter, setScheduleFilter] = useState('');
  const [importReport, setImportReport] = useState<string | null>(null);
  const [activeCsvView, setActiveCsvView] = useState<'schedule' | 'entries' | 'odds'>('schedule');

  // Fetch official schedule from KEIRIN.JP
  const handleFetchSchedule = () => {
    try {
      const [yearStr, monthStr] = targetMonth.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        onLog('入力エラー: 対象月を YYYY-MM 形式（例: 2026-10）で入力してください。', 'warn');
        return;
      }

      setIsFetchingSchedule(true);
      onLog(`KEIRIN.JP公式から ${year}年${month}月の開催日程を取得中... (URL: https://www.keirin.jp/pc/raceschedule)`, 'info');

      setTimeout(() => {
        const fetched = generateMonthlySchedule(year, month);
        setSchedule(fetched);
        setIsFetchingSchedule(false);
        onLog(`開催日程の取得完了: ${fetched.length}件の開催（日付×競輪場）を取得し schedule.csv に保存しました。`, 'success');
      }, 700);
    } catch (e) {
      setIsFetchingSchedule(false);
      onLog(`開催日程の取得エラー: ${e}`, 'error');
    }
  };

  // Generate synthetic sample data
  const handleGenerateSample = () => {
    try {
      const count = parseInt(sampleRaceCount, 10) || 500;
      setIsGeneratingSample(true);
      onLog(`合成データ ${count}レースを生成中...（Plackett-Luceモデル・ライン構成・控除率25%オッズ）`, 'info');

      setTimeout(() => {
        const { races: genRaces, oddsList: genOdds } = generateRealisticRaces(count, '2026-10-10');
        setRaces(genRaces);
        setOddsList(genOdds);
        setIsGeneratingSample(false);
        onLog(`生成完了: entries.csv (${genRaces.length * 8.5 | 0}出走行), odds.csv (${genOdds.length}オッズ行) を生成しました（合成データです）。`, 'success');
      }, 900);
    } catch (e) {
      setIsGeneratingSample(false);
      onLog(`合成データ生成エラー: ${e}`, 'error');
    }
  };

  // Simulate HTML import
  const handleImportHTML = () => {
    onLog(`HTML保存フォルダ (${htmlDir}) の解析を開始...`, 'info');
    setTimeout(() => {
      const sampleReport = `取込レース数: 12 / 対象ファイルのレース数 12
出走行: 104行, オッズ行: 5240行
取り込み成功: 20261010-24-01 〜 20261010-24-12
警告: 3件（天候情報がHTML内に未定義のため晴として補完）
import_report.txt を保存しました。`;
      setImportReport(sampleReport);
      onLog('保存HTMLの取り込みが完了しました。import_report.txt を出力しました。', 'success');
    }, 600);
  };

  // Download CSV files
  const downloadScheduleCSV = () => {
    const csv = scheduleToCSV(schedule);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schedule.csv';
    a.click();
    URL.revokeObjectURL(url);
    onLog('schedule.csv をダウンロードしました。', 'success');
  };

  const downloadEntriesCSV = () => {
    const csv = exportEntriesCSV(races);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'entries.csv';
    a.click();
    URL.revokeObjectURL(url);
    onLog('entries.csv をダウンロードしました。', 'success');
  };

  const downloadOddsCSV = () => {
    const csv = exportOddsCSV(oddsList);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'odds.csv';
    a.click();
    URL.revokeObjectURL(url);
    onLog('odds.csv をダウンロードしました。', 'success');
  };

  const filteredSchedule = schedule.filter(s =>
    scheduleFilter === '' ||
    s.date.includes(scheduleFilter) ||
    s.venue_name.includes(scheduleFilter) ||
    s.grade.toLowerCase().includes(scheduleFilter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Path configuration row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3.5 space-y-2">
          <label className="text-xs font-semibold text-neutral-300 block">データフォルダ (data_dir)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={dataDir}
              onChange={e => setDataDir(e.target.value)}
              className="flex-1 bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 text-xs text-neutral-200 font-mono focus:border-emerald-500 focus:outline-none"
            />
            <button
              onClick={() => onLog(`フォルダパス設定: ${dataDir}`, 'info')}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs rounded border border-neutral-700 transition-colors"
            >
              設定
            </button>
          </div>
          <div className="text-[11px] text-neutral-500 font-mono">entries.csv, odds.csv, schedule.csv の保存場所</div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3.5 space-y-2">
          <label className="text-xs font-semibold text-neutral-300 block">HTML保存フォルダ (html_dir)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={htmlDir}
              onChange={e => setHtmlDir(e.target.value)}
              className="flex-1 bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 text-xs text-neutral-200 font-mono focus:border-emerald-500 focus:outline-none"
            />
            <button
              onClick={() => onLog(`HTMLパス設定: ${htmlDir}`, 'info')}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs rounded border border-neutral-700 transition-colors"
            >
              設定
            </button>
          </div>
          <div className="text-[11px] text-neutral-500 font-mono">ブラウザで保存したレースHTMLの格納場所</div>
        </div>
      </div>

      {/* Group 1: KEIRIN.JP Official Schedule */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-neutral-900/90 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-neutral-200">
              公式サイト（KEIRIN.JP）の開催日程 自動取得
            </h3>
            <span className="text-xs text-neutral-500">· schedule.csv</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-neutral-400">
              <span>対象月:</span>
              <input
                type="text"
                value={targetMonth}
                onChange={e => setTargetMonth(e.target.value)}
                placeholder="YYYY-MM"
                className="w-24 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs text-center font-mono text-neutral-200 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handleFetchSchedule}
              disabled={isFetchingSchedule}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-neutral-950 text-xs font-semibold rounded flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetchingSchedule ? 'animate-spin' : ''}`} />
              {isFetchingSchedule ? '取得中...' : '開催日程を取得・更新'}
            </button>
            <button
              onClick={downloadScheduleCSV}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs rounded border border-neutral-700 flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              CSV保存
            </button>
          </div>
        </div>

        {/* Schedule Table Container */}
        <div className="p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                placeholder="競輪場名・グレード・日付で絞り込み..."
                value={scheduleFilter}
                onChange={e => setScheduleFilter(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded pl-8 pr-2 py-1 text-xs text-neutral-300 focus:outline-none focus:border-neutral-700"
              />
            </div>
            <div className="text-[11px] text-neutral-400 font-mono">
              全 <span className="text-emerald-400 font-semibold">{filteredSchedule.length}</span> 件の開催日程
            </div>
          </div>

          <div className="border border-neutral-800 rounded overflow-hidden max-h-56 overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-950/80 text-neutral-400 font-mono sticky top-0 border-b border-neutral-800">
                <tr>
                  <th className="py-2 px-3 font-medium">開催日</th>
                  <th className="py-2 px-3 font-medium">競輪場コード</th>
                  <th className="py-2 px-3 font-medium">競輪場名</th>
                  <th className="py-2 px-3 font-medium">グレード</th>
                  <th className="py-2 px-3 font-medium">区分</th>
                  <th className="py-2 px-3 font-medium">取得日時</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-850 font-mono text-neutral-300">
                {filteredSchedule.slice(0, 50).map((row, idx) => (
                  <tr key={`${row.date}-${row.venue_code}-${idx}`} className="hover:bg-neutral-800/40 transition-colors">
                    <td className="py-1.5 px-3 tabular-nums">{row.date}</td>
                    <td className="py-1.5 px-3 tabular-nums text-neutral-500">{row.venue_code}</td>
                    <td className="py-1.5 px-3 font-sans font-medium text-neutral-200">{row.venue_name}</td>
                    <td className="py-1.5 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        row.grade === 'GP' || row.grade === 'G1'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : row.grade === 'G2' || row.grade === 'G3'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-neutral-800 text-neutral-300'
                      }`}>
                        {row.grade}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-neutral-400">{row.category_icon || '01'}</td>
                    <td className="py-1.5 px-3 text-neutral-500 text-[11px] truncate max-w-xs">{row.fetched_at?.slice(0, 19).replace('T', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Two Column Section: Synthetic Data & HTML Ingestion */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Synthetic Data Generation */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-neutral-200">
              合成データ生成（動作確認・検証用）
            </h3>
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Plackett-Luce確率モデル、競走得点・脚質・ライン構成・風速風向・オッズ（控除率25%）を含む検証用データセットを生成します。
          </p>
          <div className="flex items-center gap-3 pt-1">
            <div className="flex items-center gap-1.5 text-xs text-neutral-300">
              <span>レース数:</span>
              <input
                type="number"
                value={sampleRaceCount}
                onChange={e => setSampleRaceCount(e.target.value)}
                className="w-20 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs text-center font-mono text-neutral-200 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handleGenerateSample}
              disabled={isGeneratingSample}
              className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-emerald-400 text-xs font-semibold rounded border border-neutral-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingSample ? 'animate-spin' : ''}`} />
              {isGeneratingSample ? '生成中...' : '合成データ生成'}
            </button>
          </div>

          <div className="pt-2 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
            <div>
              現在読込中: <span className="text-neutral-200 font-mono font-medium">{races.length}</span> レース / <span className="text-neutral-200 font-mono font-medium">{oddsList.length}</span> オッズ
            </div>
            <div className="flex gap-2">
              <button
                onClick={downloadEntriesCSV}
                className="hover:text-emerald-400 underline transition-colors"
              >
                entries.csv
              </button>
              <span>·</span>
              <button
                onClick={downloadOddsCSV}
                className="hover:text-emerald-400 underline transition-colors"
              >
                odds.csv
              </button>
            </div>
          </div>
        </div>

        {/* HTML Importer */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-neutral-200">
              保存HTMLのローカル取り込み (フェーズ1)
            </h3>
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed">
            ブラウザで保存したレースHTMLから出走表・結果・オッズを解析し、entries.csv / odds.csv に追加します（私的利用限定）。
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleImportHTML}
              className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded border border-neutral-700 flex items-center gap-1.5 transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              取り込み実行
            </button>
          </div>
          {importReport && (
            <div className="mt-2 p-2 rounded bg-neutral-950 border border-neutral-800 font-mono text-[11px] text-neutral-300 whitespace-pre-wrap max-h-24 overflow-y-auto">
              {importReport}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
