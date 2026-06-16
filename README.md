# Tabiori — 国内旅行プランナー（Phase 1）

> 仮プロダクト名「**Tabiori**」。名称は [`src/config/app.ts`](src/config/app.ts) の 1 か所で変更できます。

日本国内の日帰り〜数日間の旅行を、**地図と旅程**でかんたんに計画できる、ローカルファーストの Web アプリです。
旅程を作り、地図をクリックしてスポットを置き、並べ替える——そして**再読み込みしても保存されている**、という一連の体験を完成させた Phase 1 です。

- ✅ サーバー不要・ログイン不要。データは**この端末のブラウザ（IndexedDB）にだけ**保存されます。
- ✅ 地図タイルは**国土地理院（地理院タイル）**を使用。
- 🚫 Phase 1 では外部検索 API・天気 API・ルート計算 API・認証・バックエンド・AI 機能は実装していません。

## スクリーンショット

> 画像は `docs/screenshots/` に置き、下のパスを差し替えてください。

| 旅行一覧                                    | 旅程編集（地図 + 旅程）                     |
| ------------------------------------------- | ------------------------------------------- |
| ![旅行一覧](docs/screenshots/trip-list.png) | ![旅程編集](docs/screenshots/itinerary.png) |

## 技術構成

| 領域           | 採用技術                                                       |
| -------------- | -------------------------------------------------------------- |
| ビルド / 言語  | Vite 8・React 19・TypeScript 6（`strict`、`any` 禁止）         |
| スタイル       | Tailwind CSS v4・shadcn/ui 準拠の自作プリミティブ              |
| ルーティング   | React Router（`HashRouter` — GitHub Pages でサーバー設定不要） |
| 地図           | React Leaflet・Leaflet・**地理院タイル（標準地図）**           |
| 並べ替え       | dnd-kit                                                        |
| 永続化         | Dexie（IndexedDB）＋リポジトリ層                               |
| バリデーション | Zod（永続データ＆フォーム入力の検証）                          |
| テスト         | Vitest・React Testing Library・Playwright                      |
| 品質           | ESLint（Flat Config）・Prettier                                |

### アーキテクチャ（責務分離）

```
src/
  config/          プロダクト名など（変更しやすい 1 か所）
  domain/          UI ドメイン型・カテゴリ定義
  validation/      Zod スキーマ（永続化＆フォーム検証の単一の真実）
  db/              Dexie 定義・永続化レコード型・レコード⇔ドメインの変換
  repositories/    Trip / Place リポジトリ（React は Dexie を直接触らない）
  hooks/           リアクティブなデータ取得・保存状態・メディアクエリ
  components/ui/   shadcn 風プリミティブ（Button, Dialog, Select …）
  components/      共有コンポーネント（確認ダイアログ・状態表示 …）
  features/        画面単位（trips / itinerary / map）
  lib/             日付・数値ユーティリティ、汎用ヘルパー
```

- DB レコード型（`db/records.ts`）は Zod スキーマから推論し、UI ドメイン型（`domain/types.ts`）とは**明確に分離**。境界はマッパー（`db/mappers.ts`）に集約。
- React コンポーネントは Dexie を直接操作せず、必ずリポジトリ層を経由します。
- `schemaVersion` を各 Trip に保持し、Dexie の `version()` ブロックで将来のマイグレーションに備えています。

## ローカル起動

前提: Node.js 20 以上（開発は Node 24 で確認）。

```bash
npm install        # 依存をインストール（package-lock.json をコミット済み）
npm run dev        # 開発サーバー（http://localhost:5173）
npm run build      # 本番ビルド（dist/ を生成）
npm run preview    # ビルド成果物をローカルでプレビュー
```

## テスト

```bash
npm run typecheck  # 型チェック（tsc）
npm run lint       # ESLint
npm run test       # 単体・結合テスト（Vitest, 1 回実行）
npm run test:watch # Vitest ウォッチ
npm run test:e2e   # Playwright E2E（初回は下記のブラウザ取得が必要）
npm run test:e2e:ui

# Playwright のブラウザ初回取得
npx playwright install chromium
```

テスト範囲（抜粋）:

- 旅行作成フォームのバリデーション（必須・日程範囲・最大日数）
- 旅行期間からの日（TripDay）自動生成、範囲変更時の再生成と孤立スポットの救済
- スポットの追加・編集・削除、削除後の order 再採番
- 並べ替え後の order 永続化
- 再読み込み相当（新しい DB 接続）でのデータ復元
- 不正な保存データを Zod が拒否すること
- 旅行作成 →地図でスポット追加 →再読み込みで復元、までの E2E（Playwright）

## GitHub Pages への公開

`vite.config.ts` は `base: './'`（相対パス）＋ `HashRouter` 構成のため、**リポジトリ名に依存せず**サブパス配信でそのまま動きます。サーバー側のリライト設定も不要です。

手動公開（例）:

```bash
npm run build
# dist/ の中身を gh-pages ブランチ（または /docs）として公開設定する
# 例: npx gh-pages -d dist   ← gh-pages を使う場合
```

GitHub Actions で公開する場合の例（`.github/workflows/deploy.yml` として追加）:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: '${{ steps.deployment.outputs.page_url }}' }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

その後、リポジトリの **Settings → Pages → Source** を「GitHub Actions」に設定します。

## 現在実装済みの機能

**旅行一覧**

- アプリ名・短い説明・新規作成
- カードに旅行名／日程／日数／スポット数／最終更新日時を表示
- 旅行の複製・削除（削除は確認ダイアログ）
- 丁寧に作り込んだ空状態

**旅行の作成・編集**

- 旅行名・開始日・終了日・概要、保存／キャンセル、入力エラー表示

**旅程編集**

- デスクトップ: 左に旅程（スクロール）・右に地図（固定）。モバイル: 旅程／地図のタブ切替
- Day の切替（日程から自動生成。期間変更で日を再生成し、外れた日のスポットは最終日へ退避）
- 地図クリックでスポット追加（初期名「名称未設定」）
- スポットの名称・カテゴリ（観光／食事／カフェ／宿泊／買い物／移動／その他）・開始時刻・滞在時間・移動時間（手動）・メモ・URL・予算の編集
- スポットの削除・複製、同一日内のドラッグ並べ替え（キーボード操作対応）
- 選択中スポットの地図上での強調、リスト選択で該当ピンへ移動、全ピン表示
- スポットが無い日の空状態
- 変更内容の自動保存（保存中／保存済み／保存失敗の状態表示。トーストにのみ依存しない）

**地図**

- 地理院標準タイル、出典表示、初期表示は日本全体
- クリック位置から緯度経度を取得
- ピンはカテゴリごとに**色・形・アイコン**で識別（色だけに依存しない）
- ピンを旅程順に単純な直線で結ぶ（道路ルート計算はしない）

## 今後のロードマップ

Phase 1 のスコープ外。優先度順の案:

- [ ] スポットの**スポット間移動時間の合計／予算合計**などの 1 日サマリー
- [ ] 日をまたぐスポット移動（Day 間ドラッグ）
- [ ] JSON でのエクスポート／インポート、印刷用レイアウト
- [ ] 地名検索・逆ジオコーディング（外部 API。利用ポリシー順守）
- [ ] ルート計算（移動時間の自動見積もり）
- [ ] 天気・解説などの情報の肉付け
- [ ] 持ち物チェックリスト、複数端末同期、ダークモード

## 外部地図の出典

- 地図タイル: **国土地理院（地理院タイル）** — <https://maps.gsi.go.jp/development/ichiran.html>
- 地図表示ライブラリ: Leaflet / React Leaflet

地理院タイルの利用にあたっては、各タイルの利用規約・出典表示の条件に従ってください（アプリ内の地図にも出典を常時表示しています）。

## 補足

- 旧 CDN 版プロトタイプ「旅のしおり」は [`legacy/`](legacy/) に保管しています（本アプリの実装には未使用）。
