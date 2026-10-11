import React, { useState } from 'react';
import { Minus, Square, X, Download, HelpCircle, HardDrive, ShieldAlert, Laptop, Maximize2, Minimize2 } from 'lucide-react';
import { TerminalLog, LogMessage } from './TerminalLog';
import { DataTab } from './tabs/DataTab';
import { TrainTab } from './tabs/TrainTab';
import { PredictTab } from './tabs/PredictTab';
import { ReportTab } from './tabs/ReportTab';
import { AutoBetTab } from './tabs/AutoBetTab';
import { DownloadZipModal } from './modals/DownloadZipModal';
import { ScheduleItem, Race, OddsItem, BacktestReport, AutoBetRecord, AutoBetConfig, RacePrediction, BetCombo } from '../types';

interface DesktopWindowProps {
  schedule: ScheduleItem[];
  setSchedule: (s: ScheduleItem[]) => void;
  races: Race[];
  setRaces: (r: Race[]) => void;
  oddsList: OddsItem[];
  setOddsList: (o: OddsItem[]) => void;
  backtestReport: BacktestReport | null;
  setBacktestReport: (r: BacktestReport) => void;
  predictions: RacePrediction[];
  setPredictions: React.Dispatch<React.SetStateAction<RacePrediction[]>>;
  onPlaceAutoBetFromAi?: (bets: BetCombo[], race: Race) => void;
  autoBetRecords: AutoBetRecord[];
  setAutoBetRecords: React.Dispatch<React.SetStateAction<AutoBetRecord[]>>;
  balance: number;
  setBalance: React.Dispatch<React.SetStateAction<number>>;
  autoBetConfig: AutoBetConfig;
  setAutoBetConfig: React.Dispatch<React.SetStateAction<AutoBetConfig>>;
  logs: LogMessage[];
  onClearLogs: () => void;
  onAddLog: (msg: string, type?: 'info' | 'warn' | 'error' | 'success') => void;
}

export const DesktopWindow: React.FC<DesktopWindowProps> = ({
  schedule,
  setSchedule,
  races,
  setRaces,
  oddsList,
  setOddsList,
  backtestReport,
  setBacktestReport,
  predictions,
  setPredictions,
  onPlaceAutoBetFromAi,
  autoBetRecords,
  setAutoBetRecords,
  balance,
  setBalance,
  autoBetConfig,
  setAutoBetConfig,
  logs,
  onClearLogs,
  onAddLog,
}) => {
  const [activeTab, setActiveTab] = useState<'data' | 'train' | 'predict' | 'report' | 'autobet'>('predict');
  const [isLogExpanded, setIsLogExpanded] = useState(false);
  const [isZipModalOpen, setIsZipModalOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const tabs = [
    { id: 'data', label: '① データ' },
    { id: 'train', label: '② 学習・検証' },
    { id: 'predict', label: '③ AI予想・買い目' },
    { id: 'report', label: '④ 日次レポート' },
    { id: 'autobet', label: '⑤ 自動投票' },
  ] as const;

  return (
    <div className={`flex flex-col h-screen bg-neutral-950 text-neutral-100 overflow-hidden ${isMaximized ? 'p-0' : 'p-2 sm:p-4'}`}>
      {/* Windows 11 Window Frame Container */}
      <div className={`flex-1 flex flex-col bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden ${isMaximized ? 'rounded-none' : 'rounded-xl'}`}>
        {/* Windows 11 Title Bar */}
        <div className="h-10 bg-neutral-950/90 border-b border-neutral-800 flex items-center justify-between px-3 select-none shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs border border-emerald-500/30">
              K
            </div>
            <span className="text-xs font-semibold text-neutral-200 tracking-tight">
              競輪AI予想アプリ v1.0
            </span>
            <span className="hidden sm:inline-block text-[11px] text-neutral-500 font-mono">
              · Windows Desktop Edition (Tkinter / Python 3.10+)
            </span>
          </div>

          {/* Quick Action & Window Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsZipModalOpen(true)}
              className="px-2.5 py-1 text-xs bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded flex items-center gap-1.5 transition-colors"
              title="Windows用実行ファイル・バッチ・Pythonスクリプトを一括ダウンロード"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="font-medium">Windows版 ZIP ダウンロード</span>
            </button>

            <div className="flex items-center ml-2 border-l border-neutral-800 pl-2">
              <button
                onClick={() => onAddLog('ウィンドウを最小化しました（シミュレーション）', 'info')}
                className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsMaximized(!isMaximized)}
                className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
              >
                {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => onAddLog('アプリ終了（Windowsではウィンドウを閉じます）', 'info')}
                className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-rose-200 hover:bg-rose-600 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Windows Traditional Menu Ribbon */}
        <div className="h-7 bg-neutral-900 border-b border-neutral-800 flex items-center px-3 text-[11px] text-neutral-400 select-none gap-4 shrink-0">
          <button onClick={() => onAddLog('ファイルメニューを開きました', 'info')} className="hover:text-neutral-100 transition-colors">
            ファイル(F)
          </button>
          <button onClick={() => setActiveTab('data')} className="hover:text-neutral-100 transition-colors">
            データ(D)
          </button>
          <button onClick={() => setActiveTab('train')} className="hover:text-neutral-100 transition-colors">
            モデル学習(M)
          </button>
          <button onClick={() => setActiveTab('predict')} className="hover:text-neutral-100 transition-colors">
            レース予想(P)
          </button>
          <button onClick={() => setActiveTab('report')} className="hover:text-neutral-100 transition-colors">
            日次レポート(R)
          </button>
          <button onClick={() => setActiveTab('autobet')} className="hover:text-emerald-400 font-medium transition-colors">
            自動投票(A)
          </button>
          <button onClick={() => setIsZipModalOpen(true)} className="hover:text-emerald-400 transition-colors">
            Windows本体(W)
          </button>
          <button onClick={() => onAddLog('競輪AI予想アプリ v1.0 (仕様書 v0.1 フェーズ1〜3完全準拠)', 'info')} className="hover:text-neutral-100 transition-colors">
            ヘルプ(H)
          </button>
        </div>

        {/* Tabs Strip (Emulating Tkinter ttk.Notebook) */}
        <div className="h-10 bg-neutral-950/60 border-b border-neutral-800 flex items-end px-3 gap-1 select-none shrink-0">
          {tabs.map(t => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-all border-t border-x ${
                  isActive
                    ? 'bg-neutral-900 text-emerald-400 border-neutral-700 font-semibold shadow-sm -mb-px'
                    : 'text-neutral-400 hover:text-neutral-200 border-transparent hover:bg-neutral-900/50'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-neutral-900/50">
          {activeTab === 'data' && (
            <DataTab
              schedule={schedule}
              setSchedule={setSchedule}
              races={races}
              setRaces={setRaces}
              oddsList={oddsList}
              setOddsList={setOddsList}
              onLog={onAddLog}
            />
          )}

          {activeTab === 'train' && (
            <TrainTab
              races={races}
              oddsList={oddsList}
              backtestReport={backtestReport}
              setBacktestReport={setBacktestReport}
              onLog={onAddLog}
            />
          )}

          {activeTab === 'predict' && (
            <PredictTab
              races={races}
              oddsList={oddsList}
              predictions={predictions}
              setPredictions={setPredictions}
              onPlaceAutoBet={onPlaceAutoBetFromAi}
              onGoToAutoBet={() => setActiveTab('autobet')}
              onLog={onAddLog}
            />
          )}

          {activeTab === 'report' && (
            <ReportTab
              races={races}
              oddsList={oddsList}
              backtestReport={backtestReport}
              onLog={onAddLog}
            />
          )}

          {activeTab === 'autobet' && (
            <AutoBetTab
              races={races}
              oddsList={oddsList}
              records={autoBetRecords}
              setRecords={setAutoBetRecords}
              balance={balance}
              setBalance={setBalance}
              config={autoBetConfig}
              setConfig={setAutoBetConfig}
              onLog={onAddLog}
            />
          )}
        </div>

        {/* Console / Log Terminal at Bottom */}
        <TerminalLog
          logs={logs}
          onClear={onClearLogs}
          isExpanded={isLogExpanded}
          onToggleExpand={() => setIsLogExpanded(!isLogExpanded)}
        />

        {/* Status Bar / Legal Disclaimer Footer */}
        <div className="h-6 bg-neutral-950 border-t border-neutral-800 px-3 flex items-center justify-between text-[11px] text-neutral-400 select-none shrink-0">
          <div className="flex items-center gap-1.5 text-amber-400/90 truncate">
            <ShieldAlert className="w-3 h-3 shrink-0" />
            <span className="truncate">
              本アプリは車券の購入機能を持たず、利益を保証しません。購入は自己責任・余裕資金の範囲で。
            </span>
          </div>

          <div className="hidden md:flex items-center gap-3 text-neutral-500 font-mono text-[10px] shrink-0">
            <span>KEIRIN_AI_HOME: C:\Users\User\KeirinAI</span>
            <span>·</span>
            <span>DATA: {races.length} races</span>
            <span>·</span>
            <span>ODDS: {oddsList.length} rows</span>
          </div>
        </div>
      </div>

      {/* Windows Package Download & Code Viewer Modal */}
      <DownloadZipModal
        isOpen={isZipModalOpen}
        onClose={() => setIsZipModalOpen(false)}
        onLog={onAddLog}
      />
    </div>
  );
};
