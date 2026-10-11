import React, { useState } from 'react';
import { X, Download, FileCode, Check, Copy, Terminal, FolderArchive, ArrowRight } from 'lucide-react';
import { PYTHON_APP_FILES, generateWindowsAppZip } from '../../utils/windowsZip';

interface DownloadZipModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLog: (msg: string, type?: 'info' | 'warn' | 'error' | 'success') => void;
}

export const DownloadZipModal: React.FC<DownloadZipModalProps> = ({
  isOpen,
  onClose,
  onLog,
}) => {
  const [selectedFile, setSelectedFile] = useState<string>('run_gui.bat');
  const [isDownloading, setIsDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentFile = PYTHON_APP_FILES.find(f => f.name === selectedFile) || PYTHON_APP_FILES[0];

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      onLog('Windowsアプリ ZIPパッケージの生成を開始しました...', 'info');
      const blob = await generateWindowsAppZip();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'KeirinAI_Windows_Package.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onLog('KeirinAI_Windows_Package.zip のダウンロードが完了しました。', 'success');
    } catch (err) {
      onLog(`ZIP生成エラー: ${err}`, 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-neutral-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-100 flex items-center gap-2">
                Windowsアプリ パッケージ (Python / Bat / Tkinter)
              </h2>
              <p className="text-xs text-neutral-400">
                お使いのWindows PCで直接実行・exe化できる完全なソースコードと起動バッチです
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-100 rounded-md hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Guide Banner */}
        <div className="p-4 bg-neutral-950/70 border-b border-neutral-800 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-2.5 rounded-lg bg-neutral-900/90 border border-neutral-800">
            <div className="font-semibold text-emerald-400 mb-1 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] flex items-center justify-center">1</span>
              ZIPを展開
            </div>
            <p className="text-neutral-400 text-[11px] leading-relaxed">
              ダウンロードしたZIPファイルを任意のフォルダ（例: C:\KeirinAI）に展開します。
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-neutral-900/90 border border-neutral-800">
            <div className="font-semibold text-emerald-400 mb-1 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] flex items-center justify-center">2</span>
              run_gui.bat を起動
            </div>
            <p className="text-neutral-400 text-[11px] leading-relaxed">
              ダブルクリックすると自動でPython仮想環境（.venv）を作成しアプリを起動します。
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-neutral-900/90 border border-neutral-800">
            <div className="font-semibold text-emerald-400 mb-1 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] flex items-center justify-center">3</span>
              build_exe.bat でexe化
            </div>
            <p className="text-neutral-400 text-[11px] leading-relaxed">
              exe化したい場合は実行すると dist\KeirinAI\KeirinAI.exe が生成されます。
            </p>
          </div>
        </div>

        {/* File Explorer & Code Viewer */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* File List */}
          <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-neutral-800 bg-neutral-950/40 p-3 overflow-y-auto shrink-0">
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2 px-2">
              同梱ファイル ({PYTHON_APP_FILES.length})
            </div>
            <div className="space-y-1">
              {PYTHON_APP_FILES.map(file => {
                const isSelected = file.name === selectedFile;
                return (
                  <button
                    key={file.name}
                    onClick={() => setSelectedFile(file.name)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-mono flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-neutral-800 text-emerald-400 border border-neutral-700'
                        : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileCode className={`w-3.5 h-3.5 shrink-0 ${file.name.endsWith('.bat') ? 'text-amber-400' : 'text-blue-400'}`} />
                      <span className="truncate">{file.name}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Code Preview Pane */}
          <div className="flex-1 flex flex-col min-h-0 bg-neutral-950">
            <div className="px-4 py-2 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-medium text-neutral-200">{currentFile.name}</span>
                <span className="text-[11px] text-neutral-500">· {currentFile.description}</span>
              </div>
              <button
                onClick={handleCopyCode}
                className="px-2.5 py-1 text-[11px] rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 flex items-center gap-1 transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'コピー済み' : 'コードコピー'}
              </button>
            </div>
            <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] text-neutral-300 leading-relaxed bg-neutral-950 select-text">
              <pre className="whitespace-pre-wrap">{currentFile.content}</pre>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-neutral-800 bg-neutral-900/90 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-neutral-400 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span>Python 3.10以上推奨 (pandas, numpy, scikit-learn, joblib)</span>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-neutral-300 hover:text-neutral-100 hover:bg-neutral-800 rounded-lg transition-colors"
            >
              閉じる
            </button>
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex-1 sm:flex-initial px-5 py-2 text-xs font-semibold text-neutral-950 bg-emerald-400 hover:bg-emerald-300 active:bg-emerald-500 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {isDownloading ? 'ZIP作成中...' : 'Windows版 ZIP を一括ダウンロード'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
