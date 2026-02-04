# Cogito

利用者の思考プロセスを学習・再現するAIエージェント（MVP）

## セットアップ

```bash
npm install
cp .env.example .env
# .env に ANTHROPIC_API_KEY を設定
```

## 起動

```bash
npm start
```

## 機能

- 対話形式でのやり取り
- 重要情報の記憶保存（remember ツール）
- 記憶を参照した回答生成

## OpenClaw 互換のプロンプト構成

以下のファイルを読み取り、システムプロンプトを動的に組み立てます。

- `AGENTS.md`
- `SOUL.md`
- `IDENTITY.md`
- `TOOLS.md`
- `USER.md`
- `knowledge/MEMORY.md`
- `knowledge/memory/YYYY-MM-DD.md`（今日と昨日）

必要なら `COGITO_PROMPT_MAX_CHARS` で読み込み上限を変更できます。

## 記憶の保存ルール（OpenClaw式）

- **長期記憶**: `knowledge/MEMORY.md`
  - 名前・役職・判断基準・継続的な事実
- **日次記憶**: `knowledge/memory/YYYY-MM-DD.md`
  - その日の会話ログ、短期的な出来事

### 自動保存の振り分け

- `person` / `project` / `decision` → 長期記憶
- それ以外 → 日次記憶

## 統合処理（exit時）

Bun の安定性のため、セッション終了時の統合は **デフォルトOFF** です。  
有効にする場合は以下の環境変数を指定してください。

```bash
COGITO_ENABLE_CONSOLIDATE=1 bun run src/index.ts
```

## QMD / リアルタイム抽出（安定性優先）

Bun での安定性を優先する場合、以下を制御できます。

- QMD 検索（FTSのみ）は **デフォルトON**: `COGITO_ENABLE_QMD=0` で無効化
- リアルタイム抽出は **デフォルトON**: `COGITO_ENABLE_REALTIME=0` で無効化
- 埋め込み（ベクトル検索）は **デフォルトOFF**: `COGITO_ENABLE_EMBED=1` で有効化

```bash
COGITO_ENABLE_EMBED=1 bun run src/index.ts
```
```
