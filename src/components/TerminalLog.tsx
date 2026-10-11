import React, { useEffect, useRef } from 'react';
import { Terminal, Trash2, ArrowDownCircle, ChevronDown, ChevronUp } from 'lucide-react';

export interface LogMessage {
  id: string;
  time: string;
  text: string;
  type?: 'info' | 'warn' | 'error' | 'success';
}

interface TerminalLogProps {
  logs: LogMessage[];
  onClear: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export const TerminalLog: React.FC<TerminalLogProps> = ({
  logs,
  onClear,
  isExpanded,
  onToggleExpand,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = React.useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  return (
    <div className="border-t border-neutral-700 bg-neutral-950 flex flex-col shrink-0 transition-all">
      {/* Console Header Bar */}
      <div className="h-8 px-3 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between text-xs text-neutral-400 select-none">
        <div className="flex items-center gap-2 font-mono">
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-semibold text-neutral-300">実行ログ (Console Output)</span>
          <span className="text-neutral-500 font-mono text-[11px]">[{logs.length} 件]</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 transition-colors ${
              autoScroll ? 'bg-neutral-800 text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'
            }`}
            title="自動スクロール切替"
          >
            <ArrowDownCircle className="w-3 h-3" />
            自動追従
          </button>
          <button
            onClick={onClear}
            className="p-1 hover:text-neutral-200 transition-colors"
            title="ログクリア"
          >
            <Trash2 className="w-3 h-3" />
          </button>
          <button
            onClick={onToggleExpand}
            className="p-1 hover:text-neutral-200 transition-colors"
            title={isExpanded ? '縮小' : '拡大'}
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Log Body */}
      <div
        ref={scrollRef}
        className={`p-3 font-mono text-xs overflow-y-auto leading-relaxed select-text space-y-1 ${
          isExpanded ? 'h-56' : 'h-28'
        }`}
      >
        {logs.length === 0 ? (
          <div className="text-neutral-600 italic">待機中... 処理を実行するとログが表示されます。</div>
        ) : (
          logs.map(log => {
            let textColor = 'text-neutral-300';
            if (log.type === 'warn' || log.text.includes('警告') || log.text.includes('注意')) {
              textColor = 'text-amber-400';
            } else if (log.type === 'error' || log.text.includes('エラー') || log.text.includes('失敗')) {
              textColor = 'text-rose-400';
            } else if (log.type === 'success' || log.text.includes('完了') || log.text.includes('保存')) {
              textColor = 'text-emerald-400';
            }

            return (
              <div key={log.id} className="flex items-start gap-2">
                <span className="text-neutral-600 select-none text-[11px] tabular-nums shrink-0">
                  {log.time}
                </span>
                <span className={`${textColor} break-all whitespace-pre-wrap`}>
                  {log.text}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
