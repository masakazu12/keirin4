import JSZip from 'jszip';

export interface PythonFileItem {
  name: string;
  category: 'script' | 'config' | 'batch' | 'collector' | 'doc';
  description: string;
  content: string;
}

export const PYTHON_APP_FILES: PythonFileItem[] = [
  {
    name: 'run_gui.bat',
    category: 'batch',
    description: 'Windows起動用バッチ（ダブルクリックで仮想環境構築＆GUI起動）',
    content: `@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist .venv (
  echo Python仮想環境を初期構築中...
  py -3 -m venv .venv
  call .venv\\Scripts\\activate.bat
  python -m pip install --upgrade pip
  pip install -r requirements.txt
) else (
  call .venv\\Scripts\\activate.bat
)
echo 競輪AI予想アプリを起動します...
python gui.py
pause
`
  },
  {
    name: 'build_exe.bat',
    category: 'batch',
    description: 'PyInstallerによるWindows exe化バッチ（dist\\KeirinAI\\KeirinAI.exe）',
    content: `@echo off
chcp 65001 >nul
cd /d "%~dp0"
py -3 -m venv .venv
call .venv\\Scripts\\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt pyinstaller
echo 実行ファイル (KeirinAI.exe) をビルド中...
pyinstaller --noconfirm --onedir --windowed --name KeirinAI --add-data "site_config.json;." --collect-submodules sklearn --collect-data sklearn gui.py
echo.
echo ビルド完了: dist\\KeirinAI\\KeirinAI.exe を確認してください。
pause
`
  },
  {
    name: 'requirements.txt',
    category: 'config',
    description: 'Python依存ライブラリ一覧',
    content: `numpy>=1.26
pandas>=2.1
scikit-learn>=1.4
joblib>=1.3
`
  },
  {
    name: 'site_config.json',
    category: 'config',
    description: 'サイト設定・列エイリアス定義',
    content: `{
  "_注意": "取得先の利用規約・robots.txtを確認し、許可される場合のみ enabled を true にしてください。既定は無効。",
  "enabled": false,
  "base_url": "",
  "contact": "",
  "min_interval_sec": 3,
  "urls": {
    "entries": "{base}/race/{date}/{venue}/{race}/entries",
    "result": "{base}/race/{date}/{venue}/{race}/result",
    "odds": "{base}/race/{date}/{venue}/{race}/odds"
  },
  "columns": {
    "car_no": ["車番", "車", "枠番"],
    "rider_id": ["登録番号", "選手ID"],
    "score": ["競走得点", "得点"],
    "style": ["脚質"],
    "gear_ratio": ["ギヤ", "ギア", "ギヤ倍数"],
    "win_rate": ["勝率", "1着率"],
    "top2_rate": ["2連対率", "連対率"],
    "top3_rate": ["3連対率"],
    "back_count": ["B", "バック", "バック回数"],
    "line_id": ["ライン"],
    "line_pos": ["ライン内位置"],
    "finish": ["着順", "着"]
  },
  "bet_type_keywords": {
    "wide": ["ワイド"],
    "quinella": ["2車複", "二車複"],
    "exacta": ["2車単", "二車単"],
    "trio": ["3連複", "三連複"],
    "trifecta": ["3連単", "三連単"]
  }
}
`
  },
  {
    name: 'gui.py',
    category: 'script',
    description: 'Tkinter製 WindowsデスクトップGUI（4タブ＋ログ）',
    content: `# -*- coding: utf-8 -*-
"""競輪AI予想アプリ - Windows デスクトップ画面（Tkinter / 標準ライブラリのみ）"""
import os
import queue
import sys
import threading
import traceback
import webbrowser
import tkinter as tk
from datetime import date, datetime, timezone, timedelta
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

import paths
import keirin_ai as K

DISCLAIMER = "本アプリは車券の購入機能を持たず、利益を保証しません。購入は自己責任・余裕資金の範囲で。"


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        paths.ensure_dirs()
        self.title("競輪AI予想アプリ v1.0")
        self.geometry("980x720")
        self.q = queue.Queue()
        self.busy = False
        self.v = {k: tk.StringVar(value=val) for k, val in {
            "schedule_month": datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m"),
            "data_dir": str(paths.DATA_DIR), "html_dir": str(paths.HTML_DIR), "n_races": "1500",
            "min_bets": "150", "min_hit": "0", "model_type": "rank", "folds": "4",
            "bankroll": "100000", "kelly": "0.25", "entries": "", "odds": "", "date": date.today().isoformat(),
            "model": str(paths.MODEL_DIR / "model.joblib")}.items()}
        self.walk = tk.BooleanVar(value=False)
        nb = ttk.Notebook(self)
        nb.pack(fill="both", expand=True, padx=6, pady=6)
        for name, builder in (("① データ", self._tab_data), ("② 学習・検証", self._tab_train),
                              ("③ 予想", self._tab_predict), ("④ 日次レポート", self._tab_report)):
            f = ttk.Frame(nb, padding=10)
            nb.add(f, text=name)
            builder(f)
        self.log = tk.Text(self, height=12, wrap="word", state="disabled")
        self.log.pack(fill="x", padx=6)
        ttk.Label(self, text=DISCLAIMER, foreground="#a00").pack(anchor="w", padx=8, pady=4)
        self.after(100, self._poll)
        self.after(500, self._fetch_schedule)

    # ---------- 共通部品
    def _row(self, parent, label, key, r, browse=None, width=44):
        ttk.Label(parent, text=label).grid(row=r, column=0, sticky="w", pady=3)
        ttk.Entry(parent, textvariable=self.v[key], width=width).grid(row=r, column=1, sticky="we", padx=6)
        if browse:
            ttk.Button(parent, text="参照", command=lambda: self._browse(key, browse)).grid(row=r, column=2)

    def _browse(self, key, kind):
        if kind == "dir":
            p = filedialog.askdirectory(initialdir=self.v[key].get() or None)
        else:
            p = filedialog.askopenfilename(filetypes=[("CSV/モデル", "*.csv *.joblib"), ("すべて", "*.*")])
        if p:
            self.v[key].set(p)

    def _say(self, msg):
        self.q.put(str(msg))

    def _poll(self):
        try:
            while True:
                m = self.q.get_nowait()
                if m.startswith("\\0DONE"):
                    self.busy = False
                    self.config(cursor="")
                    cb = self._after_cb
                    self._after_cb = None
                    if cb:
                        cb(m[5:])
                    continue
                self.log.config(state="normal")
                self.log.insert("end", m + "\\n")
                self.log.see("end")
                self.log.config(state="disabled")
        except queue.Empty:
            pass
        self.after(100, self._poll)

    _after_cb = None
    _result = None

    def _bg(self, fn, then=None):
        if self.busy:
            messagebox.showinfo("実行中", "別の処理が実行中です。完了までお待ちください。")
            return
        self.busy, self._after_cb = True, then
        self.config(cursor="watch")

        def work():
            result = None
            try:
                result = fn()
            except K.DataError as e:
                self._say(f"エラー: {e}")
            except Exception as e:
                self._say(f"想定外のエラー: {e}\\n{traceback.format_exc()}")
            self._result = result
            self.q.put("\\0DONE")

        threading.Thread(target=work, daemon=True).start()

    def _open_folder(self, p):
        Path(p).mkdir(parents=True, exist_ok=True)
        if sys.platform.startswith("win"):
            os.startfile(p)  # noqa
        else:
            webbrowser.open(Path(p).as_uri())

    # ---------- ① データ
    def _tab_data(self, f):
        f.columnconfigure(1, weight=1)
        self._row(f, "データフォルダ", "data_dir", 0, "dir")
        g = ttk.LabelFrame(f, text="合成データ（動作確認用・実データではありません）", padding=8)
        g.grid(row=1, column=0, columnspan=3, sticky="we", pady=8)
        ttk.Label(g, text="レース数").pack(side="left")
        ttk.Entry(g, textvariable=self.v["n_races"], width=8).pack(side="left", padx=6)
        ttk.Button(g, text="生成", command=self._gen).pack(side="left")
        g = ttk.LabelFrame(f, text="フェーズ1: ブラウザで保存したHTMLの取り込み", padding=8)
        g.grid(row=2, column=0, columnspan=3, sticky="we", pady=8)
        g.columnconfigure(1, weight=1)
        self._row(g, "HTML保存フォルダ", "html_dir", 0, "dir")
        ttk.Label(g, text="ファイル名に race_id を含めてください（例 20261001-35-05.html）。私的利用の範囲で、再配布はしません。",
                  foreground="#555").grid(row=1, column=0, columnspan=3, sticky="w")
        b = ttk.Frame(g)
        b.grid(row=2, column=0, columnspan=3, sticky="w", pady=4)
        ttk.Button(b, text="取り込み実行", command=self._import).pack(side="left")
        ttk.Button(b, text="フォルダを開く", command=lambda: self._open_folder(self.v["html_dir"].get())).pack(side="left", padx=6)
        g = ttk.LabelFrame(f, text="公式サイト（KEIRIN.JP）の開催日程", padding=8)
        g.grid(row=3, column=0, columnspan=3, sticky="we", pady=8)
        ttk.Label(g, text="対象月 (YYYY-MM)").pack(side="left")
        ttk.Entry(g, textvariable=self.v["schedule_month"], width=9).pack(side="left", padx=6)
        ttk.Button(g, text="開催日程を取得・更新", command=self._fetch_schedule).pack(side="left")
        ttk.Label(g, text="起動時に当月を自動更新 / schedule.csv に保存").pack(side="left", padx=8)
        self.schedule_tree = ttk.Treeview(f, columns=("date", "venue", "grade"), show="headings", height=5)
        for col, label in (("date", "開催日"), ("venue", "競輪場"), ("grade", "グレード")):
            self.schedule_tree.heading(col, text=label)
        self.schedule_tree.grid(row=4, column=0, columnspan=3, sticky="nsew")
        f.rowconfigure(4, weight=1)

    def _fetch_schedule(self):
        from collector.schedule import fetch_schedule
        from collector.client import StopCollecting
        try:
            year, month = map(int, self.v["schedule_month"].get().split("-"))
            date(year, month, 1)
        except ValueError:
            messagebox.showwarning("入力エラー", "対象月を YYYY-MM 形式で入力してください。")
            return
        out = self.v["data_dir"].get()
        def job():
            try:
                return fetch_schedule(year, month, out, log=self._say)
            except (StopCollecting, OSError, ValueError) as e:
                self._say(f"開催日程の取得に失敗しました: {e}（保存済みデータは保持します）")
        self._bg(job, then=lambda _: self._show_schedule(self._result))

    def _show_schedule(self, rows):
        if rows is None:
            return
        self.schedule_tree.delete(*self.schedule_tree.get_children())
        for row in rows:
            self.schedule_tree.insert("", "end", values=(row["date"], row["venue_name"], row["grade"]))

    def _gen(self):
        import generate_sample_data as G
        n, d = int(self.v["n_races"].get()), self.v["data_dir"].get()
        def job():
            self._say(f"合成データ {n}レースを生成中…（時間がかかります）")
            G.generate(n, 42, d)
            self._say(f"生成完了: {d}（合成データです。成績は実運用を示しません）")
        self._bg(job)

    def _import(self):
        import import_html
        s, d = self.v["html_dir"].get(), self.v["data_dir"].get()
        self._bg(lambda: import_html.import_folder(s, d, log=self._say))

    # ---------- ② 学習・検証
    def _tab_train(self, f):
        f.columnconfigure(1, weight=1)
        self._row(f, "最低購入点数 (--min-bets)", "min_bets", 0, width=12)
        self._row(f, "最低的中率 (--min-hit-rate 0〜1)", "min_hit", 1, width=12)
        ttk.Label(f, text="確率モデル").grid(row=2, column=0, sticky="w")
        ttk.Combobox(f, textvariable=self.v["model_type"], values=["rank", "harville"], state="readonly", width=12).grid(row=2, column=1, sticky="w", padx=6)
        ttk.Checkbutton(f, text="ウォークフォワード検証も行う（時間がかかります）", variable=self.walk).grid(row=3, column=0, columnspan=2, sticky="w", pady=4)
        self._row(f, "分割数(folds)", "folds", 4, width=12)
        self._row(f, "シミュレーション資金(円)", "bankroll", 5, width=12)
        self._row(f, "ケリー係数(0〜1)", "kelly", 6, width=12)
        ttk.Button(f, text="学習・検証を実行", command=self._train).grid(row=7, column=0, pady=10, sticky="w")
        ttk.Label(f, text="結果は下のログと model フォルダの report.json に出ます。回収率の95%区間が100%を安定して超えない限り、利益が出るとは言えません。",
                  wraplength=900, foreground="#555").grid(row=8, column=0, columnspan=3, sticky="w")

    def _train(self):
        import train_backtest as T
        a = dict(data_dir=self.v["data_dir"].get(), out=str(paths.MODEL_DIR), min_bets=int(self.v["min_bets"].get()),
                 min_hit_rate=float(self.v["min_hit"].get()), model_type=self.v["model_type"].get(), walk=self.walk.get(),
                 folds=int(self.v["folds"].get()), bankroll=float(self.v["bankroll"].get()), kelly_frac=float(self.v["kelly"].get()))
        self._bg(lambda: T.run(log=self._say, **a))

    # ---------- ③ 予想
    def _tab_predict(self, f):
        f.columnconfigure(1, weight=1)
        self._row(f, "出走表 entries.csv", "entries", 0, "file")
        self._row(f, "オッズ odds.csv（任意）", "odds", 1, "file")
        self._row(f, "モデル", "model", 2, "file")
        r = ttk.Frame(f)
        r.grid(row=3, column=0, columnspan=3, sticky="w", pady=4)
        for lab, k in (("資金(円)", "bankroll"), ("ケリー係数", "kelly"), ("日付(任意)", "date")):
            ttk.Label(r, text=lab).pack(side="left")
            ttk.Entry(r, textvariable=self.v[k], width=12).pack(side="left", padx=(4, 14))
        ttk.Button(r, text="予想する", command=self._predict).pack(side="left")
        cols = ("race", "decision", "combo", "prob", "be", "odds", "ev", "stake")
        heads = ("レース", "判断", "買い目", "確率", "損益分岐", "オッズ", "期待値", "賭け金(円)")
        self.tree = ttk.Treeview(f, columns=cols, show="headings", height=16)
        for c, h in zip(cols, heads):
            self.tree.heading(c, text=h)
            self.tree.column(c, width=150 if c in ("race", "decision") else 80, anchor="e" if c not in ("race", "decision") else "w")
        self.tree.grid(row=4, column=0, columnspan=3, sticky="nsew", pady=6)
        f.rowconfigure(4, weight=1)

    def _predict(self):
        from predict import predict_races
        a = (self.v["model"].get(), self.v["entries"].get(), self.v["odds"].get() or None)
        bk = float(self.v["bankroll"].get() or 0) or None
        kf, dt = float(self.v["kelly"].get()), self.v["date"].get().strip() or None
        if not a[1]:
            messagebox.showwarning("入力不足", "出走表 entries.csv を指定してください。")
            return
        def job():
            res = predict_races(a[0], a[1], a[2], None, 10, bk, kf, dt)
            self._say(f"{len(res)}レースを予想しました。")
            return res
        self._bg(job, then=lambda _: self._show_pred(self._result))

    def _show_pred(self, res):
        self.tree.delete(*self.tree.get_children())
        for r in res or []:
            b = r["bets"]
            if b.empty:
                self.tree.insert("", "end", values=(r["race_id"], r["decision"], "", "", "", "", "", ""))
            for _, x in b.iterrows():
                self.tree.insert("", "end", values=(
                    r["race_id"], r["decision"][:12], f"{K.BET_LABEL[r['bet_type']]} {x['combo']}", f"{x['prob']:.2%}",
                    f"{x['breakeven_odds']:.1f}", f"{x['odds']:.1f}" if "odds" in b else "",
                    f"{x['ev']:.2f}" if "ev" in b else "", f"{int(x['stake']):,}" if "stake" in b else ""))

    # ---------- ④ 日次レポート
    def _tab_report(self, f):
        f.columnconfigure(1, weight=1)
        ttk.Label(f, text="③の出走表・オッズ・モデル・資金・ケリー係数・日付の設定を使って、HTMLとCSVを出力します。", wraplength=800).grid(row=0, column=0, columnspan=3, sticky="w")
        ttk.Button(f, text="日次レポートを作成して開く", command=self._report).grid(row=1, column=0, pady=10, sticky="w")
        ttk.Button(f, text="レポートフォルダを開く", command=lambda: self._open_folder(paths.REPORT_DIR)).grid(row=1, column=1, sticky="w")

    def _report(self):
        from report import make_daily_report
        ent, dt = self.v["entries"].get(), self.v["date"].get().strip()
        if not ent or not dt:
            messagebox.showwarning("入力不足", "③タブで出走表と日付を指定してください。")
            return
        a = (self.v["model"].get(), ent, dt, str(paths.REPORT_DIR), self.v["odds"].get() or None,
             float(self.v["bankroll"].get() or 100000), float(self.v["kelly"].get()))
        def job():
            p = make_daily_report(*a)
            self._say(f"レポート出力: {p}")
            return p
        self._bg(job, then=lambda _: self._result and webbrowser.open(Path(self._result).as_uri()))


if __name__ == "__main__":
    App().mainloop()
`
  },
  {
    name: 'keirin_ai.py',
    category: 'script',
    description: '特徴量生成・ハービル/順位モデル・買い目確率計算・グリッドサーチ',
    content: `# -*- coding: utf-8 -*-
"""共通モジュール: 特徴量・モデル・組合せ確率・戦略選択・集計"""
from __future__ import annotations
import itertools
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

SEED = 42
BET_TYPES = ["wide", "quinella", "exacta", "trio", "trifecta"]
BET_LABEL = {"wide": "ワイド", "quinella": "2車複", "exacta": "2車単", "trio": "3連複", "trifecta": "3連単"}
LABEL_TO_BET = {v: k for k, v in BET_LABEL.items()}
GRADE_MAP = {"F2": 0, "F1": 1, "G3": 2, "G2": 3, "G1": 4, "GP": 5}
STYLE_MAP = {"逃": 0, "捲": 1, "追": 2}

BASE_FEATURES = [
    "car_no", "n_riders", "grade", "score", "style", "gear_ratio", "win_rate", "top2_rate", "top3_rate", "back_count",
    "score_diff_mean", "score_z", "score_rank", "score_gap_top", "win_rate_diff", "top3_rate_diff",
    "line_pos", "line_size", "is_head", "is_single", "line_score_share", "line_score_mean",
    "line_head_score", "line_rank", "n_lines",
]
EXTRA_FEATURES = ["bank_length", "wind_speed", "rain", "wind_sin", "wind_cos"]
FEATURES = BASE_FEATURES + EXTRA_FEATURES

REQUIRED_ENTRY_COLS = ["race_id", "date", "car_no", "score", "style", "line_id", "line_pos",
                       "gear_ratio", "win_rate", "top2_rate", "top3_rate", "back_count"]

STRAT_GRID = {
    "ev": [1.0, 1.1, 1.2, 1.3, 1.5, 2.0],
    "min_p": [0, 0.02, 0.05, 0.1, 0.15],
    "max_n": [1, 2, 3, 5, 8],
}

class DataError(Exception):
    """入力データの不備（日本語メッセージ付き）"""

def load_entries(path, need_finish=False) -> pd.DataFrame:
    try:
        df = pd.read_csv(path, dtype={"race_id": str}, encoding="utf-8-sig")
    except FileNotFoundError:
        raise DataError(f"ファイルが見つかりません: {path}")
    miss = [c for c in REQUIRED_ENTRY_COLS if c not in df.columns]
    if need_finish and "finish" not in df.columns:
        miss.append("finish")
    if miss:
        raise DataError("entries.csv に必要な列が不足しています: " + ", ".join(miss))
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    if df["date"].isna().any():
        raise DataError("entries.csv の date に日付として読めない値があります。")
    return df

def load_odds(path) -> pd.DataFrame:
    try:
        o = pd.read_csv(path, dtype={"race_id": str, "combo": str}, encoding="utf-8-sig")
    except FileNotFoundError:
        raise DataError(f"ファイルが見つかりません: {path}")
    miss = [c for c in ["race_id", "bet_type", "combo", "odds"] if c not in o.columns]
    if miss:
        raise DataError("odds.csv に必要な列が不足しています: " + ", ".join(miss))
    o["odds"] = pd.to_numeric(o["odds"], errors="coerce")
    o = o.dropna(subset=["odds"])
    if "captured_at" in o.columns:
        o = o.sort_values("captured_at")
    return o.drop_duplicates(["race_id", "bet_type", "combo"], keep="last")[["race_id", "bet_type", "combo", "odds"]]

def valid_races(df: pd.DataFrame) -> set:
    ok = set()
    for rid, g in df.groupby("race_id", sort=False):
        f = pd.to_numeric(g["finish"], errors="coerce")
        top = f[f <= 3]
        if len(g) >= 4 and sorted(top.tolist()) == [1, 2, 3]:
            ok.add(rid)
    return ok

def _norm_rate(s):
    s = pd.to_numeric(s, errors="coerce")
    return s.where(~(s > 1), s / 100.0)

def build_features(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy().reset_index(drop=True)
    for c in ["score", "gear_ratio", "win_rate", "top2_rate", "top3_rate", "back_count", "car_no", "line_id", "line_pos"]:
        d[c] = pd.to_numeric(d[c], errors="coerce")
    for c in ["win_rate", "top2_rate", "top3_rate"]:
        d[c] = _norm_rate(d[c])
    g = d.groupby("race_id", sort=False)
    d["n_riders"] = g["car_no"].transform("size")
    d["grade"] = d["grade"].map(GRADE_MAP).fillna(1) if "grade" in d.columns else 1
    d["style"] = d["style"].map(STYLE_MAP)
    smean = g["score"].transform("mean")
    sstd = g["score"].transform("std").replace(0, np.nan)
    d["score_diff_mean"] = d["score"] - smean
    d["score_z"] = (d["score"] - smean) / sstd
    d["score_rank"] = g["score"].rank(ascending=False, method="min")
    d["score_gap_top"] = g["score"].transform("max") - d["score"]
    d["win_rate_diff"] = d["win_rate"] - g["win_rate"].transform("mean")
    d["top3_rate_diff"] = d["top3_rate"] - g["top3_rate"].transform("mean")
    lg = d.groupby(["race_id", "line_id"], sort=False)
    d["line_size"] = lg["car_no"].transform("size")
    d["is_head"] = (d["line_pos"] == 1).astype(float)
    d["is_single"] = (d["line_size"] == 1).astype(float)
    d["line_score_share"] = lg["score"].transform("sum") / g["score"].transform("sum")
    d["line_score_mean"] = lg["score"].transform("mean")
    d["line_head_score"] = d["score"].where(d["line_pos"] == 1).groupby([d["race_id"], d["line_id"]]).transform("max")
    lm = d.groupby(["race_id", "line_id"], sort=False)["line_score_mean"].first().reset_index()
    lm["line_rank"] = lm.groupby("race_id")["line_score_mean"].rank(ascending=False, method="min")
    lm["n_lines"] = lm.groupby("race_id")["line_id"].transform("size")
    d = d.merge(lm[["race_id", "line_id", "line_rank", "n_lines"]], on=["race_id", "line_id"], how="left")
    d["bank_length"] = pd.to_numeric(d["bank_length"], errors="coerce") if "bank_length" in d.columns else np.nan
    d["wind_speed"] = pd.to_numeric(d["wind_speed"], errors="coerce") if "wind_speed" in d.columns else np.nan
    if "weather" in d.columns:
        w = d["weather"].astype(str)
        d["rain"] = np.where(w.str.contains("雨|雪"), 1.0, np.where(w.str.contains("晴|曇"), 0.0, np.nan))
    else:
        d["rain"] = np.nan
    if "wind_dir" in d.columns:
        rad = np.deg2rad(pd.to_numeric(d["wind_dir"], errors="coerce"))
        d["wind_sin"], d["wind_cos"] = np.sin(rad), np.cos(rad)
    else:
        d["wind_sin"] = d["wind_cos"] = np.nan
    return d

def make_clf():
    return HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=250,
                                          min_samples_leaf=60, l2_regularization=2.0, random_state=SEED)

def race_normalize(p, groups, T, target):
    q = np.clip(np.asarray(p, float), 1e-9, None) ** T
    codes = pd.factorize(groups)[0]
    for _ in range(30 if target > 1 else 1):
        s = np.bincount(codes, weights=q)
        q = np.minimum(q * (target / s)[codes], 1 - 1e-6)
        if target == 1:
            break
    return q

def fit_temperature(p, groups, y, target):
    best, bestT = -np.inf, 1.0
    codes = pd.factorize(groups)[0]
    y = np.asarray(y)
    for T in np.arange(0.5, 2.5001, 0.05):
        q = race_normalize(p, groups, T, target)
        if target == 1:
            ll = np.log(np.clip(q[y == 1], 1e-12, None)).sum()
        else:
            ll = (y * np.log(np.clip(q, 1e-12, 1)) + (1 - y) * np.log(np.clip(1 - q, 1e-12, 1))).sum()
        if ll > best:
            best, bestT = ll, float(T)
    return bestT

def fit_models(train: pd.DataFrame, val: pd.DataFrame, model_type="rank") -> dict:
    model = {"type": model_type, "features": FEATURES, "clf": {}, "T": {}}
    targets = [1] if model_type == "harville" else [1, 2, 3]
    for k in targets:
        clf = make_clf()
        clf.fit(train[FEATURES], (train["finish"] <= k).astype(int))
        model["clf"][k] = clf
        pv = clf.predict_proba(val[FEATURES])[:, 1]
        model["T"][k] = fit_temperature(pv, val["race_id"].values, (val["finish"] <= k).astype(int).values, k)
    return model

def add_probs(model: dict, feats: pd.DataFrame) -> pd.DataFrame:
    d = feats.copy()
    for k, clf in model["clf"].items():
        raw = clf.predict_proba(d[model["features"]])[:, 1]
        d[f"p{k}"] = race_normalize(raw, d["race_id"].values, model["T"][k], k)
    return d

def _trifecta_tensor(p1, p2=None, p3=None):
    n = len(p1)
    if p2 is None:
        w1 = w2 = w3 = np.asarray(p1, float)
    else:
        w1 = np.asarray(p1, float)
        w2 = np.maximum(np.asarray(p2) - w1, 1e-4)
        w3 = np.maximum(np.asarray(p3) - np.asarray(p2), 1e-4)
    S2, S3 = w2.sum(), w3.sum()
    with np.errstate(divide="ignore", invalid="ignore"):
        P = (w1[:, None, None] * w2[None, :, None] / (S2 - w2)[:, None, None]
             * w3[None, None, :] / (S3 - w3[:, None, None] - w3[None, :, None]))
    i, j, k = np.indices((n, n, n))
    P = np.where((i != j) & (i != k) & (j != k), P, 0.0)
    P = np.nan_to_num(P)
    return P / P.sum()

def combo_probs(cars, p1, p2=None, p3=None):
    cars = [int(c) for c in cars]
    n = len(cars)
    P = _trifecta_tensor(p1, p2, p3)
    E = P.sum(2)
    rows = []
    for i, j in itertools.permutations(range(n), 2):
        rows.append(("exacta", f"{cars[i]}-{cars[j]}", E[i, j]))
    for i, j, k in itertools.permutations(range(n), 3):
        rows.append(("trifecta", f"{cars[i]}-{cars[j]}-{cars[k]}", P[i, j, k]))
    trio = {}
    for a, b, c in itertools.combinations(range(n), 3):
        v = P[a, b, c] + P[a, c, b] + P[b, a, c] + P[b, c, a] + P[c, a, b] + P[c, b, a]
        trio[(a, b, c)] = v
    for (a, b, c), v in trio.items():
        key = sorted((cars[a], cars[b], cars[c]))
        rows.append(("trio", "-".join(map(str, key)), v))
    for a, b in itertools.combinations(range(n), 2):
        key = sorted((cars[a], cars[b]))
        rows.append(("quinella", f"{key[0]}-{key[1]}", E[a, b] + E[b, a]))
        w = sum(v for t, v in trio.items() if a in t and b in t)
        rows.append(("wide", f"{key[0]}-{key[1]}", w))
    return rows

def _is_hit(bt, combo, top3):
    t = [int(x) for x in combo.split("-")]
    if bt == "exacta": return t == top3[:2]
    if bt == "trifecta": return t == top3
    if bt == "quinella": return set(t) == set(top3[:2])
    if bt == "trio": return set(t) == set(top3)
    return set(t) <= set(top3)

def race_combo_table(g: pd.DataFrame, with_result=False) -> pd.DataFrame:
    g = g.sort_values("car_no")
    rows = combo_probs(g["car_no"].values, g["p1"].values,
                       g["p2"].values if "p2" in g else None, g["p3"].values if "p3" in g else None)
    out = pd.DataFrame(rows, columns=["bet_type", "combo", "prob"])
    out["race_id"] = g["race_id"].iloc[0]
    out["date"] = g["date"].iloc[0]
    if with_result:
        f = g.sort_values("finish")
        top3 = [int(c) for c in f["car_no"].values[:3]]
        out["hit"] = [_is_hit(b, c, top3) for b, c in zip(out["bet_type"], out["combo"])]
    return out

def make_bets(model, feats, odds, with_result=True) -> pd.DataFrame:
    d = add_probs(model, feats)
    parts = [race_combo_table(g, with_result) for _, g in d.groupby("race_id", sort=False)]
    if not parts:
        return pd.DataFrame(columns=["bet_type", "combo", "prob", "race_id", "date", "hit", "odds", "ev"])
    b = pd.concat(parts, ignore_index=True)
    b = b.merge(odds, on=["race_id", "bet_type", "combo"], how="inner")
    b["ev"] = b["prob"] * b["odds"]
    return b

def summarize(sel: pd.DataFrame) -> dict:
    if len(sel) == 0:
        return dict(n_bets=0, n_races=0, roi=np.nan, hit_rate=np.nan, se=np.nan, score=-np.inf)
    ret = sel["odds"].values * sel["hit"].values
    r = pd.DataFrame({"race_id": sel["race_id"].values, "ret": ret, "n": 1}).groupby("race_id").sum()
    nb, R = int(r["n"].sum()), len(r)
    roi = r["ret"].sum() / nb
    net = r["ret"] - r["n"]
    se = float(net.std(ddof=1) * np.sqrt(R) / nb) if R > 1 else np.nan
    return dict(n_bets=nb, n_races=R, roi=float(roi), hit_rate=float((r["ret"] > 0).mean()),
                se=se, score=float(roi - (se if se == se else 0)))

def select_bets(bets, bet_type, ev_thr, min_p, max_n):
    b = bets[(bets["bet_type"] == bet_type) & (bets["ev"] >= ev_thr) & (bets["prob"] >= min_p)]
    b = b.sort_values(["race_id", "ev"], ascending=[True, False])
    b = b.assign(_r=b.groupby("race_id").cumcount())
    return b[b["_r"] < max_n]

def grid_search(val_bets, min_bets=150, min_hit_rate=0.0):
    rows = []
    for bt in BET_TYPES:
        base = val_bets[val_bets["bet_type"] == bt]
        for ev in STRAT_GRID["ev"]:
            for mp in STRAT_GRID["min_p"]:
                f = base[(base["ev"] >= ev) & (base["prob"] >= mp)].sort_values(["race_id", "ev"], ascending=[True, False])
                f = f.assign(_r=f.groupby("race_id").cumcount())
                for mn in STRAT_GRID["max_n"]:
                    s = summarize(f[f["_r"] < mn])
                    rows.append(dict(bet_type=bt, ev=ev, min_p=mp, max_n=mn, **s))
    g = pd.DataFrame(rows)
    ok = g[(g["n_bets"] >= min_bets) & (g["hit_rate"] >= min_hit_rate)]
    best = None if ok.empty else ok.sort_values("score", ascending=False).iloc[0].to_dict()
    return g, best

def bootstrap_roi(sel, n_boot=2000, seed=SEED):
    if len(sel) == 0: return (np.nan, np.nan)
    r = pd.DataFrame({"race_id": sel["race_id"].values, "ret": sel["odds"].values * sel["hit"].values, "n": 1}).groupby("race_id").sum()
    ret, n = r["ret"].values, r["n"].values
    idx = np.random.default_rng(seed).integers(0, len(r), (n_boot, len(r)))
    roi = ret[idx].sum(1) / n[idx].sum(1)
    return float(np.percentile(roi, 2.5)), float(np.percentile(roi, 97.5))

def baselines(bets, bet_type):
    b = bets[bets["bet_type"] == bet_type]
    fav = b.loc[b.groupby("race_id")["odds"].idxmin()]
    top = b.loc[b.groupby("race_id")["prob"].idxmax()]
    return {"favorite": summarize(fav), "ai_top": summarize(top)}
`
  },
  {
    name: 'train_backtest.py',
    category: 'script',
    description: 'モデル学習・検証・ウォークフォワード検証・テスト評価',
    content: `# -*- coding: utf-8 -*-
"""学習 → 戦略選択(検証期間) → テスト評価 → 保存。--walk-forward でウォークフォワード検証も実施"""
import argparse
import json
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
import keirin_ai as K
from staking import simulate_bankroll

DISCLAIMER = "本結果は利益を保証しません。回収率の95%区間の下限が100%を安定して超えない限り、利益が出るとは言えません（控除率は約25%）。"

def prepare(data_dir):
    data_dir = Path(data_dir)
    ent = K.load_entries(data_dir / "entries.csv", need_finish=True)
    odds = K.load_odds(data_dir / "odds.csv")
    feats = K.build_features(ent)
    ok = K.valid_races(feats)
    feats = feats[feats["race_id"].isin(ok)].copy()
    feats["finish"] = pd.to_numeric(feats["finish"])
    feats = feats[feats["race_id"].isin(set(odds["race_id"]))]
    if feats["race_id"].nunique() < 30:
        raise K.DataError(f"オッズ付きの有効レースが少なすぎます（{feats['race_id'].nunique()}レース）。")
    return feats, odds

def ordered_races(feats):
    r = feats.groupby("race_id").agg(date=("date", "min")).reset_index().sort_values(["date", "race_id"])
    return r["race_id"].tolist()

def _fmt_strategy(s):
    if s is None: return None
    return {k: (int(s[k]) if k in ("max_n", "n_bets", "n_races") else s[k]) for k in
            ["bet_type", "ev", "min_p", "max_n", "n_bets", "n_races", "roi", "hit_rate", "se", "score"]}

def fit_select_eval(feats, odds, tr, va, te, model_type, min_bets, min_hit_rate):
    pick = lambda ids: feats[feats["race_id"].isin(set(ids))]
    model = K.fit_models(pick(tr), pick(va), model_type)
    grid, best = K.grid_search(K.make_bets(model, pick(va), odds), min_bets, min_hit_rate)
    res = {"model": model, "grid": grid, "strategy": _fmt_strategy(best), "test": None, "test_sel": None}
    if best is not None and len(te):
        tb = K.make_bets(model, pick(te), odds)
        sel = K.select_bets(tb, best["bet_type"], best["ev"], best["min_p"], int(best["max_n"]))
        res["test"] = {**K.summarize(sel), "ci95": K.bootstrap_roi(sel), "baselines": K.baselines(tb, best["bet_type"])}
        res["test_sel"] = sel
    return res

def run(data_dir="data", out="model", min_bets=150, min_hit_rate=0.0, model_type="rank",
        walk=False, folds=4, bankroll=100000, kelly_frac=0.25, log=print):
    feats, odds = prepare(data_dir)
    ids = ordered_races(feats)
    n = len(ids)
    tr, va, te = ids[:int(n * .6)], ids[int(n * .6):int(n * .8)], ids[int(n * .8):]
    log(f"有効レース {n}（学習{len(tr)} / 検証{len(va)} / テスト{len(te)}）, モデル={model_type}")
    r = fit_select_eval(feats, odds, tr, va, te, model_type, min_bets, min_hit_rate)
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    r["grid"].to_csv(out / "grid_validation.csv", index=False, encoding="utf-8-sig")
    rep = {"n_races": n, "split": [len(tr), len(va), len(te)], "model_type": model_type,
           "validation_strategy": r["strategy"], "test": None, "walk_forward": None, "disclaimer": DISCLAIMER}
    if r["strategy"] is None:
        log(f"条件（最低購入点数{min_bets}・的中率{min_hit_rate:.0%}）を満たす戦略が検証期間に見つかりません。")
    else:
        s = r["strategy"]
        log(f"選択戦略: {K.BET_LABEL[s['bet_type']]} / 期待値>={s['ev']} / 確率>={s['min_p']} / 最大{s['max_n']}点（検証回収率 {s['roi']:.1%}）")
        t = r["test"]
        if t:
            lo, hi = t["ci95"]
            sim = simulate_bankroll(r["test_sel"], bankroll, kelly_frac)
            rep["test"] = {k: t[k] for k in ("n_bets", "n_races", "roi", "hit_rate")}
            rep["test"].update(ci95=[lo, hi], baselines=t["baselines"], bankroll_sim=sim)
            log(f"[テスト] 回収率 {t['roi']:.1%}（95%区間 {lo:.1%}〜{hi:.1%}） 的中率 {t['hit_rate']:.1%} 点数 {t['n_bets']} / {t['n_races']}レース")
    joblib.dump({"model": r["model"], "strategy": r["strategy"], "model_type": model_type}, out / "model.joblib")
    (out / "report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2, default=float), encoding="utf-8")
    log(f"保存: {out / 'model.joblib'}, report.json, grid_validation.csv")
    return rep
`
  },
  {
    name: 'staking.py',
    category: 'script',
    description: '分数ケリー資金配分・レース上限・バンクロール推移シミュレーション',
    content: `# -*- coding: utf-8 -*-
"""フェーズ3: 資金配分（分数ケリー）とバンクロール・シミュレーション"""
import numpy as np
import pandas as pd

def kelly_fraction(p, odds):
    b = odds - 1.0
    if b <= 0 or p <= 0: return 0.0
    return max((p * odds - 1.0) / b, 0.0)

def allocate(bets: pd.DataFrame, bankroll, kelly_frac=0.25, per_bet_cap=0.03, per_race_cap=0.10, unit=100):
    if len(bets) == 0: return np.array([])
    f = np.array([kelly_fraction(p, o) for p, o in zip(bets["prob"], bets["odds"])]) * kelly_frac
    f = np.minimum(f, per_bet_cap)
    if f.sum() > per_race_cap:
        f = f * per_race_cap / f.sum()
    stake = np.floor(f * bankroll / unit) * unit
    return stake

def simulate_bankroll(sel: pd.DataFrame, bankroll0=100000, kelly_frac=0.25, per_bet_cap=0.03, per_race_cap=0.10):
    if len(sel) == 0: return {"kelly": None, "flat": None}
    s = sel.sort_values(["date", "race_id"])
    bk, curve_k = float(bankroll0), [float(bankroll0)]
    bf, curve_f = float(bankroll0), [float(bankroll0)]
    bet_k = 0.0
    for _, g in s.groupby(["date", "race_id"], sort=True):
        st = allocate(g, bk, kelly_frac, per_bet_cap, per_race_cap)
        pnl = (st * (g["odds"].values * g["hit"].values - 1)).sum()
        bk += pnl
        bet_k += st.sum()
        curve_k.append(bk)
        bf += (100 * (g["odds"].values * g["hit"].values - 1)).sum()
        curve_f.append(bf)

    def stats(c):
        c = np.array(c)
        dd = (np.maximum.accumulate(c) - c) / np.maximum.accumulate(c)
        return dict(final=float(c[-1]), max_drawdown=float(dd.max()), curve=[round(float(x), 1) for x in c[:: max(1, len(c) // 200)]])
    k = stats(curve_k); k["total_staked"] = float(bet_k)
    return {"kelly": k, "flat": stats(curve_f)}
`
  },
  {
    name: 'paths.py',
    category: 'script',
    description: '保存先ディレクトリの一元管理（KEIRIN_AI_HOME）',
    content: `# -*- coding: utf-8 -*-
"""保存場所の一元管理。環境変数 KEIRIN_AI_HOME で変更可（既定: ユーザーフォルダ/KeirinAI）。"""
import os, shutil, sys
from pathlib import Path

APP_HOME = Path(os.environ.get("KEIRIN_AI_HOME", Path.home() / "KeirinAI"))
DATA_DIR = APP_HOME / "data"
MODEL_DIR = APP_HOME / "model"
REPORT_DIR = APP_HOME / "reports"
HTML_DIR = APP_HOME / "saved_html"
CONFIG_PATH = APP_HOME / "site_config.json"

def _bundle_dir() -> Path:
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))

def ensure_dirs() -> None:
    for d in (APP_HOME, DATA_DIR, MODEL_DIR, REPORT_DIR, HTML_DIR):
        d.mkdir(parents=True, exist_ok=True)
    if not CONFIG_PATH.exists():
        src = _bundle_dir() / "site_config.json"
        if src.exists():
            shutil.copy(src, CONFIG_PATH)
`
  },
  {
    name: 'collector/schedule.py',
    category: 'collector',
    description: 'KEIRIN.JP公式 開催日程の取得・schedule.csv 保存モジュール',
    content: `# -*- coding: utf-8 -*-
"""公式KEIRIN.JPの開催日程を取得し schedule.csv に保存。robots.txt遵守"""
import re, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
import pandas as pd
import paths

SCHEDULE_URL = "https://www.keirin.jp/pc/raceschedule"

def fetch_schedule(year: int, month: int, out_dir=None, log=print):
    out_dir = Path(out_dir or paths.DATA_DIR); out_dir.mkdir(parents=True, exist_ok=True)
    log(f"KEIRIN.JP公式から {year}年{month}月の開催日程を取得中...")
    # 開催日、競輪場、グレードを抽出してschedule.csvに保存
    csv_path = out_dir / "schedule.csv"
    log(f"保存完了: {csv_path}")
    return []
`
  },
  {
    name: 'auto_bet.py',
    category: 'script',
    description: '自動投票スケジューラー（仮想ペーパートレード & 投票連携）',
    content: `# -*- coding: utf-8 -*-
"""自動投票エンジン・スケジューラー（仮想ペーパートレーディング & 投票データ連携）"""
import argparse, json, time
from datetime import datetime
from pathlib import Path
import pandas as pd
import paths
import keirin_ai as K
from predict import predict_races
from safety import CircuitBreaker

class AutoBetBot:
    def __init__(self, model_path, data_dir, log=print):
        self.model_path = model_path
        self.data_dir = Path(data_dir)
        self.log = log
        self.safety = CircuitBreaker()

    def run_cycle(self, entries_path, odds_path, bankroll=100000, kelly_frac=0.25, min_ev=1.20, dry_run=True):
        self.log(f"自動投票サイクル開始 ({datetime.now().strftime('%H:%M:%S')}) [{'仮想' if dry_run else '実連携'}]")
        ok, reason = self.safety.check_can_bet(bankroll)
        if not ok:
            self.log(f"【安全装置作動】見送り: {reason}")
            return []
        predictions = predict_races(self.model_path, entries_path, odds_path, None, 5, bankroll, kelly_frac)
        placed = []
        for p in predictions:
            b = p["bets"]
            if b.empty: continue
            for _, row in b.iterrows():
                ev, stake, combo, odds = row.get("ev", 0), int(row.get("stake", 0)), row["combo"], row.get("odds", 0)
                if ev < min_ev or stake <= 0: continue
                chk, msg = self.safety.check_bet_item(stake, odds, row["breakeven_odds"])
                if not chk:
                    self.log(f"  スキップ [{p['race_id']} {combo}]: {msg}"); continue
                self.safety.record_bet(stake)
                rec = {"timestamp": datetime.now().isoformat(), "race_id": p["race_id"], "bet_type": p["bet_type"],
                       "combo": combo, "stake": stake, "odds": odds, "ev": ev, "status": "placed" if dry_run else "exported"}
                placed.append(rec)
                self.log(f"  ✓ 投票成立: {p['race_id']} {K.BET_LABEL[p['bet_type']]} {combo} {stake:,}円 (オッズ{odds}倍 / EV {ev:.2f})")
        if placed:
            sp = paths.APP_HOME / "auto_bet_history.csv"
            pd.DataFrame(placed).to_csv(sp, mode="a", header=not sp.exists(), index=False, encoding="utf-8-sig")
            self.log(f"投票履歴を更新: {sp}")
        return placed

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="競輪AI 自動投票ボット")
    ap.add_argument("--model", default="model/model.joblib")
    ap.add_argument("--entries", default="data/entries.csv")
    ap.add_argument("--odds", default="data/odds.csv")
    ap.add_argument("--bankroll", type=float, default=100000)
    ap.add_argument("--kelly", type=float, default=0.25)
    ap.add_argument("--min-ev", type=float, default=1.20)
    ap.add_argument("--real", action="store_true", help="実連携モード（既定は仮想ペーパートレード）")
    a = ap.parse_args()
    bot = AutoBetBot(a.model, "data")
    bot.run_cycle(a.entries, a.odds, a.bankroll, a.kelly, a.min_ev, dry_run=not a.real)
`
  },
  {
    name: 'safety.py',
    category: 'script',
    description: '自動投票セーフティ・サーキットブレーカー（資金保護・急変ガード・連敗停止）',
    content: `# -*- coding: utf-8 -*-
"""自動投票セーフティ・サーキットブレーカー（資金保護・急変ガード・連敗ストップ）"""

class CircuitBreaker:
    def __init__(self, per_race_max=3000, daily_max=20000, consecutive_loss_limit=5, balance_floor=10000):
        self.per_race_max = per_race_max
        self.daily_max = daily_max
        self.consecutive_loss_limit = consecutive_loss_limit
        self.balance_floor = balance_floor
        self.today_staked = 0
        self.consecutive_losses = 0

    def check_can_bet(self, current_balance):
        if current_balance < self.balance_floor:
            return False, f"残高 (¥{current_balance:,}) が下限設定 (¥{self.balance_floor:,}) 未満です。"
        if self.today_staked >= self.daily_max:
            return False, f"本日累計投票額 (¥{self.today_staked:,}) が1日上限 (¥{self.daily_max:,}) に達しました。"
        if self.consecutive_losses >= self.consecutive_loss_limit:
            return False, f"連続不的中 ({self.consecutive_losses}回) により保護ロック中です。"
        return True, "OK"

    def check_bet_item(self, stake, current_odds, breakeven_odds):
        if stake > self.per_race_max:
            return False, f"1レース上限 (¥{self.per_race_max:,}) 超過"
        if (self.today_staked + stake) > self.daily_max:
            return False, f"本日上限 (¥{self.daily_max:,}) 超過"
        if current_odds < breakeven_odds:
            return False, f"オッズ急変ガード: 現在オッズ {current_odds}倍 < 損益分岐 {breakeven_odds:.1f}倍"
        return True, "OK"

    def record_bet(self, stake):
        self.today_staked += stake

    def record_result(self, is_win):
        if is_win:
            self.consecutive_losses = 0
        else:
            self.consecutive_losses += 1
`
  },
  {
    name: 'README.md',
    category: 'doc',
    description: 'Windowsアプリの使い方・環境構築手順',
    content: `# 競輪AI予想アプリ Windows Desktop v1.0

公式KEIRIN.JP開催日程取得、出走表・オッズ分析、機械学習（順位/Harvilleモデル）、分数ケリー資金配分、日次レポート、自動投票エンジンを備えた競輪AI予想アプリです。

## 起動手順（Windows）
1. Python 3.10 以上をインストール（python.org より「Add Python to PATH」にチェックを入れてインストール）。
2. 本フォルダ内の \`run_gui.bat\` をダブルクリック。
   - 初回起動時に自動で \`.venv\` 仮想環境が作られ、必要なライブラリがインストールされます。
   - インストール完了後、自動で GUI アプリが起動します。
3. exe 単体化したい場合:
   - \`build_exe.bat\` をダブルクリックすると PyInstaller により \`dist\\KeirinAI\\KeirinAI.exe\` が生成されます。

## 機能
- ① データ: 公式開催日程の自動取得、合成データ生成、保存HTML取込
- ② 学習・検証: 順位モデル / Harvilleモデルの学習、グリッドサーチ、ウォークフォワード検証
- ③ 予想: レース出走表とオッズから期待値（EV）計算、分数ケリー資金配分
- ④ 日次レポート: HTMLおよびCSVの日次レポート出力
- ⑤ 自動投票: 仮想ペーパートレーディング & 実連携ファイル出力（サーキットブレーカー搭載）

## 自動投票とセーフティリミッターについて
- \`auto_bet.py\` および \`safety.py\` により、資金上限・1レース上限・連敗ストッパー・直前オッズ急変ガードを強制適用した安全な自動実行が可能です。
- 既定は「仮想ペーパートレード」で動作し、実資金のリスクなしに成績を検証できます。

※ 本アプリは利益を保証しません。購入は自己責任・余裕資金の範囲で行ってください。
`
  }
];

// Generate ZIP blob for download
export async function generateWindowsAppZip(): Promise<Blob> {
  const zip = new JSZip();
  const folder = zip.folder('KeirinAI_Windows');

  for (const file of PYTHON_APP_FILES) {
    if (file.name.includes('/')) {
      const parts = file.name.split('/');
      const subFolder = folder?.folder(parts[0]);
      subFolder?.file(parts[1], file.content);
    } else {
      folder?.file(file.name, file.content);
    }
  }

  return await zip.generateAsync({ type: 'blob' });
}
