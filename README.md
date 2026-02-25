# Pixel Agents Web

[English](#english) | [繁體中文](#繁體中文) | [日本語](#日本語)

---

## English

A standalone web application that visualizes your active [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions as animated pixel art characters in a virtual office.

Each Claude Code session running on your machine is detected automatically and assigned a character that walks around, sits at desks, and visually reflects what the agent is doing — typing when writing code, reading when searching files, waiting when it needs your attention.

> Based on [Pixel Agents](https://github.com/pablodelucca/pixel-agents) by [Pablo De Lucca](https://github.com/pablodelucca), originally a VS Code extension. Converted to a standalone web app with a Node.js server + React SPA.

### Features

- **Auto-discovery** — scans `~/.claude/projects/` every 3 seconds; no manual setup needed
- **Lobby view** — see all active projects at a glance, click to enter a room
- **Live activity tracking** — characters animate based on what the agent is actually doing (writing, reading, running commands)
- **New session notification** — toast notification when a new session appears, click to jump to that room
- **Office layout editor** — design your office with floors, walls, and furniture
- **Speech bubbles** — visual indicators when an agent is waiting for input or needs permission
- **Sound notifications** — optional chime when an agent finishes its turn
- **Sub-agent visualization** — Task tool sub-agents spawn as separate characters linked to their parent
- **Persistent layouts** — office design saved per-project at `~/.pixel-agents/layouts/`
- **Diverse characters** — 6 unique character palettes with hue-shift for additional variety

### Requirements

- **Node.js** 20 or later
- **Claude Code CLI** installed and running (the app observes its JSONL transcripts)

### Quick Start

```bash
# Clone and install
git clone https://github.com/sweslo17/pixel-agents-web.git
cd pixel-agents-web
npm install

# Build all packages (shared → server → client)
npm run build

# Start the server
npm start
```

Open **http://localhost:3000** in your browser. Any active Claude Code sessions will appear automatically.

### Development

```bash
# Run server and client in dev mode with hot reload
npm run dev
```

This starts the Fastify server (port 3000) and Vite dev server (port 5173) concurrently.

### Project Structure

```
shared/       — Shared types, protocol definitions, constants
server/       — Fastify HTTP + WebSocket server
  src/
    core/     — SessionScanner, ProjectManager, DisplayNames
    claude/   — FileWatcher, TranscriptParser, TimerManager
    ws/       — WebSocket broadcaster and message router
    routes/   — HTTP API endpoints (assets, health)
    assets/   — Asset loader (PNG → sprite data)
    persistence/ — Layout and seat file I/O
client/       — React SPA (Vite)
  src/
    office/   — Game engine, renderer, characters, layout editor
    lobby/    — Lobby canvas and renderer
    hooks/    — WebSocket, lobby, connection hooks
    components/ — UI overlays (toolbar, settings, zoom, toast)
```

### How It Works

1. **Session scanning** — the server watches `~/.claude/projects/` for JSONL transcript files modified within the last 5 minutes
2. **JSONL parsing** — each active session's transcript is tailed in real-time to detect tool usage, status changes, and sub-agent activity
3. **WebSocket relay** — parsed events are broadcast to connected browser clients
4. **Canvas rendering** — the React client renders a pixel art office with character state machines (idle/walk/type/read), BFS pathfinding, and z-sorted entity drawing

No modifications to Claude Code are needed — it's purely observational.

### Office Assets

The office tileset is **[Office Interior Tileset (16x16)](https://donarg.itch.io/officetileset)** by **Donarg** ($2 USD on itch.io). It is not included in this repository. The app works without it — you get characters, walls, and basic layout, but furniture requires the imported assets.

### Credits

- Original project: [Pixel Agents](https://github.com/pablodelucca/pixel-agents) by [Pablo De Lucca](https://github.com/pablodelucca)
- Office tileset: [Office Interior Tileset](https://donarg.itch.io/officetileset) by Donarg

### License

[MIT](LICENSE)

---

## 繁體中文

一個獨立的 Web 應用程式，將你正在執行的 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 工作階段，以像素風動畫角色的方式呈現在虛擬辦公室中。

你的機器上每個正在運行的 Claude Code 工作階段都會被自動偵測，並指派一個角色在辦公室裡走動、坐在桌前，且即時反映 Agent 正在做的事 — 寫程式時打字、搜尋檔案時閱讀、需要你注意時等待。

> 基於 [Pablo De Lucca](https://github.com/pablodelucca) 的 [Pixel Agents](https://github.com/pablodelucca/pixel-agents)（原為 VS Code 擴充套件），改寫為獨立的 Web 應用（Node.js 伺服器 + React SPA）。

### 功能特色

- **自動偵測** — 每 3 秒掃描 `~/.claude/projects/`，無需手動設定
- **大廳畫面** — 一覽所有活躍專案，點擊進入房間
- **即時活動追蹤** — 角色根據 Agent 的實際動作產生動畫（寫入、讀取、執行指令）
- **新工作階段通知** — 偵測到新工作階段時彈出提示，點擊直接跳轉
- **辦公室版面編輯器** — 自訂地板、牆壁和家具
- **對話泡泡** — Agent 等待輸入或需要授權時的視覺指示
- **音效通知** — Agent 完成回合時的可選提示音
- **子 Agent 視覺化** — Task 工具的子 Agent 以獨立角色呈現
- **版面持久化** — 各專案的辦公室設計儲存在 `~/.pixel-agents/layouts/`
- **多樣化角色** — 6 種角色配色，超過 6 個時自動色相偏移

### 系統需求

- **Node.js** 20 以上
- 已安裝並正在運行 **Claude Code CLI**

### 快速開始

```bash
# 複製並安裝
git clone https://github.com/sweslo17/pixel-agents-web.git
cd pixel-agents-web
npm install

# 建置所有套件（shared → server → client）
npm run build

# 啟動伺服器
npm start
```

在瀏覽器開啟 **http://localhost:3000**，所有活躍的 Claude Code 工作階段會自動顯示。

### 開發模式

```bash
# 同時啟動伺服器與前端的開發模式（支援熱重載）
npm run dev
```

### 運作原理

1. **工作階段掃描** — 伺服器監看 `~/.claude/projects/` 中最近 5 分鐘內修改過的 JSONL 檔案
2. **JSONL 解析** — 即時追蹤每個活躍工作階段的工具使用、狀態變化和子 Agent 活動
3. **WebSocket 轉發** — 解析後的事件透過 WebSocket 廣播給瀏覽器端
4. **Canvas 渲染** — React 前端渲染像素風辦公室，包含角色狀態機、BFS 尋路和 Z 排序繪製

無需修改 Claude Code — 純粹觀察式運作。

### 致謝

- 原始專案：[Pablo De Lucca](https://github.com/pablodelucca) 的 [Pixel Agents](https://github.com/pablodelucca/pixel-agents)
- 辦公室素材：Donarg 的 [Office Interior Tileset](https://donarg.itch.io/officetileset)

### 授權

[MIT](LICENSE)

---

## 日本語

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) のアクティブなセッションを、ピクセルアートのアニメーションキャラクターとしてバーチャルオフィスに表示するスタンドアロン Web アプリケーションです。

マシン上で実行中の各 Claude Code セッションは自動的に検出され、キャラクターが割り当てられます。キャラクターはオフィス内を歩き回り、デスクに座り、エージェントの動作をリアルタイムで反映します — コードを書いているときはタイピング、ファイルを検索しているときは読書、入力待ちのときは待機のアニメーションを表示します。

> [Pablo De Lucca](https://github.com/pablodelucca) 氏の [Pixel Agents](https://github.com/pablodelucca/pixel-agents)（元は VS Code 拡張機能）をベースに、Node.js サーバー + React SPA のスタンドアロン Web アプリに変換しました。

### 機能

- **自動検出** — `~/.claude/projects/` を 3 秒ごとにスキャン、手動設定不要
- **ロビービュー** — すべてのアクティブなプロジェクトを一覧表示、クリックでルームに入室
- **リアルタイムアクティビティ追跡** — エージェントの実際の動作に基づくアニメーション（書き込み、読み取り、コマンド実行）
- **新セッション通知** — 新しいセッション検出時にトースト通知、クリックで直接移動
- **オフィスレイアウトエディタ** — 床、壁、家具でオフィスをデザイン
- **吹き出し** — エージェントが入力待ちまたは許可待ちの視覚的インジケーター
- **サウンド通知** — エージェントのターン完了時のオプション通知音
- **サブエージェント表示** — Task ツールのサブエージェントを親にリンクされた個別キャラクターとして表示
- **レイアウト永続化** — プロジェクトごとのオフィスデザインを `~/.pixel-agents/layouts/` に保存
- **多様なキャラクター** — 6 種類のパレット、それ以上は色相シフトで自動バリエーション

### 必要条件

- **Node.js** 20 以降
- **Claude Code CLI** がインストール・実行中であること

### クイックスタート

```bash
# クローンしてインストール
git clone https://github.com/sweslo17/pixel-agents-web.git
cd pixel-agents-web
npm install

# 全パッケージをビルド（shared → server → client）
npm run build

# サーバーを起動
npm start
```

ブラウザで **http://localhost:3000** を開きます。アクティブな Claude Code セッションが自動的に表示されます。

### 開発モード

```bash
# サーバーとクライアントを開発モードで同時起動（ホットリロード対応）
npm run dev
```

### 仕組み

1. **セッションスキャン** — サーバーが `~/.claude/projects/` 内の直近 5 分以内に更新された JSONL ファイルを監視
2. **JSONL パース** — 各アクティブセッションのトランスクリプトをリアルタイムで追跡（ツール使用、ステータス変更、サブエージェント）
3. **WebSocket 中継** — パースされたイベントをブラウザクライアントにブロードキャスト
4. **Canvas レンダリング** — React クライアントがピクセルアートオフィスをレンダリング（キャラクターステートマシン、BFS パスファインディング、Z ソート描画）

Claude Code の変更は不要です — 純粋に観察するだけで動作します。

### クレジット

- オリジナルプロジェクト：[Pablo De Lucca](https://github.com/pablodelucca) 氏の [Pixel Agents](https://github.com/pablodelucca/pixel-agents)
- オフィスタイルセット：Donarg 氏の [Office Interior Tileset](https://donarg.itch.io/officetileset)

### ライセンス

[MIT](LICENSE)
