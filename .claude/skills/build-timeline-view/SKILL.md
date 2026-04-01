---
name: build-timeline-view
description: 日本の政策・国政調査データから、時系列と関係グラフの出力を生成する可視化スキル。
context: fork
agent: timeline-viz-builder
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
model: sonnet
---
テーマ: $ARGUMENTS

## このスキルの目的

政策調査データから、**ユーザーが脳内マップを構築するのを助ける**インタラクティブな可視化を生成する。単にデータを全て表示するのではなく、「何を前に出し、何を大きく、何を小さく、何を隠すか」という情報設計の判断が本質。

## 根底にある設計思想

### 1. 全部見せるな——段階的開示

ユーザーは密度の高い日本語テキストをドカンと出されても処理できない。情報には階層がある。

- **ナラティブモード**: スクロールテリングで時系列に沿って物語を語り、ノードを段階的に出現させる。ユーザーは一度に2〜5個の新しいイベントだけ受け取る。
- **探索モード**: 物語を追い終えた後に、明示的なユーザー操作（ボタンクリック）で全データを自由に閲覧できるモードに切り替える。自動遷移はしない。
- **詳細パネル**: クリックで初めて出典・接続・不確実性メモなどの深い情報が現れる。

### 2. タイムラインを1画面に詰め込むな——カメラがパンする

全イベントをビューポートに圧縮すると、カードが小さくなりテキストが読めなくなる。50年分のデータでは物理的に不可能。

**解決策: 長いキャンバス + ビューポートのパン**
- タイムラインはビューポートの数倍の高さ（例: 3400px）を持つキャンバスに配置。
- ビューポート（100vh）は「窓」として機能し、CSS `transform: translateY` でキャンバス上をパンする。
- 各ナラティブステップに `timeCenter`（小数年、例: 2022.8）を定義し、そこにカメラが滑らかに移動する。
- ビューポート端のノードはフェードアウトし、「窓から覗いている」感覚を演出する。
- 右端にミニバーで現在位置を表示。

### 3. 重要度を視覚で語れ

全ノードを同じサイズで描くと、何が重要かわからない。

- **接続度（degree）でティア分類**: 6以上=hero、4-5=major、3以下=minor。
- **hero**: 大きなカード（300×68px）、太字、日付+タイトル2行。
- **major**: 中（250×52px）、日付+タイトル。
- **minor**: 小（210×40px）、タイトルのみ。
- カードの左辺に3pxのドメインカラーバーを付与し、所属ドメインを色で即座に識別。

### 4. 接続線は控えめに——ホバーで前面に

常時すべてのエッジを表示すると視覚的ノイズになる。

- **エッジに優先度（priority 1〜6）を割り当て**: 因果関係（発端となる=1）は常時表示、言及（=6）はデフォルト非表示。
- **2層SVG**: 通常のエッジは年代帯の上・ノードの下（z-index: 3）。ホバー時にハイライトされたエッジはノードの上（z-index: 25）に浮上。
- **直線**: 曲線は見づらい。`<line>` で十分。矢印は `<marker>` で。
- **ホバー時のdim**: ホバー対象に無関係なノード・エッジを opacity 0.04〜0.12 にdim。

### 5. レーン内の重なりを知的に解決する

3レーン（社会的外部要因 / 制度への入力・反応 / 公式制度過程）の各レーン内で、密集する時期のノードが重なる問題。

**2段階アルゴリズム**:
1. **Y軸の押し下げ**: 同一レーン内で日付順にソートし、前のノードとの間隔が最小ギャップ（52px）未満ならpush down。
2. **X軸のクラスタ対応ジグザグ**: Y方向に近いノード群をクラスタとして検出。
   - 孤立ノード: レーン中央に配置。
   - 2ノードのペア: 左右に振り分け（hero控えめ±6%、その他±8%）。
   - 3ノード以上: レーン幅±11%に均等分布し、重要度の高いノードを中央に配置。

### 6. ライトテーマ + クリーンなタイポグラフィ

- 白背景にNoto Sans JP。ダークモードは分析ツールには不適。
- 年代帯は偶数年を薄いグレー（#f8fafc）で区別。
- 控えめなシャドウとボーダーでカードの存在感を出す。
- 日本語のフォントウェイトは300〜700の範囲で、情報階層に合わせて使い分ける。

### 7. 2つのモードを明確に分離する

| | ナラティブモード | 探索モード |
|---|---|---|
| 目的 | 物語を追う | 自由に調べる |
| 進行 | スクロールで自動パン | ドラッグ/ホイールで手動 |
| ノード表示 | 段階的出現 | 全表示 |
| エッジ表示 | フォーカスノードの接続のみ | priority 3以下を常時表示 |
| 遷移 | ボタンクリックで探索へ | ボタンクリックでストーリーへ戻る |

探索モードは `position: fixed` のフルスクリーンオーバーレイとして実装し、スクロールテリングのDOM構造から完全に切り離す。これにより「スクロールするとストーリーに戻ってしまう」問題を回避する。

## テンプレートアーキテクチャ

### 原則: テンプレート + データ4ファイル

Reactアプリのコード（コンポーネント・CSS・レイアウトロジック）は `templates/policy-explorer/` に一元管理されている。**テーマ固有のコードは一切触らない。** このスキルは以下だけを生成する:

1. テンプレートを `outputs/{theme-slug}/policy-explorer/` にコピー
2. テーマ固有のデータ5ファイルを `src/data/` に配置
3. `npm install && npm run build`

### テンプレート（変更しない）

```
templates/policy-explorer/
├── src/
│   ├── App.jsx             # メインアプリ（3モード: ストーリー/タイムライン/アクター）
│   ├── TimelineViz.jsx     # タイムライン描画
│   ├── DetailPanel.jsx     # 詳細パネル（sourceLinksから資料リンク表示、アクターへのリンク）
│   ├── OrgNetwork.jsx      # アクターネットワーク（D3 force + ピボット探索パネル）
│   ├── index.css           # 全スタイル
│   ├── main.jsx            # エントリポイント
│   └── data/
│       └── layout.js       # レイアウト計算（config.jsからYEAR_START/ENDを読む）
├── index.html
├── package.json            # d3 を含む
└── vite.config.js
```

### テーマ固有データ（毎回生成する5ファイル）

```
outputs/{theme-slug}/policy-explorer/src/data/
├── config.js          # タイトル・年範囲・テーマslug
├── graph.js           # ノード+エッジ（events/event_links → ES module）
├── sourceLinks.js     # event_id → 資料タイトル+URLマップ
├── network.js         # アクターネットワークデータ（orgNodes/orgEdges/orgNameMap）
└── narrative.js       # ストーリーテリングのステップ定義
```

### config.js の仕様

```js
const config = {
  title: 'テーマのタイトル（ヘッダーに表示）',
  subtitle: null,  // null なら「{yearStart}〜{yearEnd} | Nイベント · N接続」を自動生成
  themeSlug: 'theme-slug',
  yearStart: 2004,  // データ中の最小年
  yearEnd: 2026,    // データ中の最大年 + 1
};
export default config;
```

### graph.js の仕様

```js
const graphData = {
  meta: { theme: "テーマ名", theme_slug: "slug", generated: "YYYY-MM-DD" },
  nodes: [
    {
      id: "XX-EV-001",
      label: "イベントタイトル",
      date: "2022-04-27",           // event_date_start
      date_text: "2022年4月27日",    // event_date_text
      event_type: "審議会部会",
      domain: "公式制度過程",         // event_domain（3ドメインのいずれか）
      policy_stage: "審議",
      organizations: ["法務省"],
      people: [],
      summary: "要約テキスト...",
      source_ids: ["SRC-010"],
      confidence: 0.95,
      notes_uncertainty: "..."
    }, ...
  ],
  edges: [
    {
      id: "lnk_001",
      source: "XX-EV-001",
      target: "XX-EV-002",
      relation_type: "発端となる",
      rationale: "...",
      evidence: "...",
      confidence: "high"
    }, ...
  ]
};
export default graphData;
```

**domain フィールド**: 必ず `公式制度過程` `制度への入力・反応` `社会的外部要因` の3値のいずれかにマップする。これがレーン配置の基準になる。

### sourceLinks.js の仕様

```js
const sourceLinks = {
  "XX-EV-001": [
    { source_id: "SRC-010", source_title: "資料タイトル", source_url: "https://..." }
  ], ...
};
export default sourceLinks;
```

### network.js の仕様

アクターネットワーク（主体間の共起関係）のデータ。events.ndjson + entities.ndjson から生成する。

```js
const networkData = {
  orgNodes: [
    {
      id: "法務省",              // 正規化された短い名前
      label: "法務省",
      group: "政府",             // "政府" | "業界" | "国際" | "専門家" | "その他"
      event_count: 13,
      event_ids: ["XX-EV-001", ...]
    }, ...
  ],
  orgEdges: [
    {
      source: "法務省",
      target: "法制審議会",
      weight: 5,                 // 共有イベント数
      shared_events: ["XX-EV-011", ...]
    }, ...
  ],
  eventNodes: [
    // graph.js の nodes と同じ構造（重複OK）
    { id, label, date, date_text, domain, summary, organizations, confidence }
  ],
  sourceLinks: {
    "XX-EV-001": [{ source_id, source_title, source_url }], ...
  },
  orgNameMap: {
    // graph.js の長い組織名 → network.js の正規化名
    "株式会社トレードワルツ（貿易コンソーシアム）": "TradeWaltz（貿易コンソーシアム）",
    "法制審議会商法（船荷証券等関係）部会": "法制審議会",
    ...
  }
};
export default networkData;
```

**orgNameMap**: graph.js（タイムライン）の組織名と network.js の正規化名を結ぶマッピング。DetailPanel の「アクター関係図で見る」クリック時にこのマップで名前を変換する。

**group**: アクターのカテゴリ。ネットワーク図のノード色に使う:
- `政府`: 省庁・審議会・内閣 → 青 `#2563eb`
- `業界`: 企業・業界団体・プラットフォーム → ローズ `#e11d48`
- `国際`: 国際機関・外国政府 → アンバー `#f59e0b`
- `専門家`: 弁護士会・研究会・法律事務所 → エメラルド `#059669`
- `その他`: 上記に該当しない → グレー `#64748b`

**正規化ルール**:
- 同一組織の表記揺れ（例: 「経済産業省」「経済産業省（G7議長国日本）」「経済産業省 貿易経済協力局貿易振興課」）は最短の代表名に統一
- 部会は親組織に統合（例: 「法制審議会商法（船荷証券等関係）部会」→「法制審議会」）
- P&Iグループ等の上位組織は代表名に統合

### narrative.js の仕様

```js
const narrativeSteps = [
  {
    id: 'step-0',
    title: 'ステップタイトル',
    subtitle: 'サブタイトル',
    body: '本文テキスト（200〜400字）。\n\n段落分けに改行2つ。',
    revealNodes: ['XX-EV-001', 'XX-EV-002'],   // このステップで出現させるノード
    focusNodes: ['XX-EV-001'],                  // ハイライトするノード
    timeCenter: 2022.3,                          // カメラ目標位置（小数年）
    showEdges: true,                             // focusNodes接続のエッジを表示するか
  }, ...
];
export default narrativeSteps;
```

### データフロー

1. **graph.js**: events.ndjson + event_links.ndjson から自動生成。
2. **sourceLinks.js**: source_links.ndjson から自動生成。event_id → 資料情報配列のマップ。
3. **config.js**: events.ndjson の日付範囲とテーマ名から自動生成。
4. **narrative.js**: events・links・entities を読み、因果の流れを分析した上で**ナラティブを設計して生成**。これだけがAIの創造的作業。
5. **layout.js**: config.js から年範囲、graph.js からノード・エッジを読み、座標を自動計算。**変更不要。**

### スクロールテリングの仕組み

```
<div class="scrolly">
  <div class="sticky-viz">          ← position: sticky; top: 0; height: 100vh
    <TimelineViz viewOffset={...} />
  </div>
  <div class="scroll-steps">        ← position: relative; z-index: 5; pointer-events: none
    <div class="scroll-step">       ← min-height: 85vh; 各ステップのトリガー領域
      <div class="step-card">       ← pointer-events: auto; フローティングカード
        <h3>タイトル</h3>
        <p>本文</p>
      </div>
    </div>
    ...
  </div>
</div>
```

- `IntersectionObserver` が各 `.scroll-step` を監視し、`activeStep` を更新。
- `activeStep` の変化 → `viewOffset` 再計算 → CSS transition でタイムラインがパン。
- `revealedIds` は0〜activeStepまでの全 `revealNodes` の累積和。過去に出現したノードは消えない。

### z-index 設計（重要）

| 要素 | z-index | pointer-events |
|---|---|---|
| 年代帯 (.year-band) | 1 | なし（背景） |
| 背景エッジSVG (.edges-bg) | 3 | none（SVG）/ stroke（個別line） |
| ノード (.event-node) | 10（hover時30） | auto |
| 前景エッジSVG (.edges-fg) | 25 | **none**（SVG）/ stroke（個別line） |

**最重要**: 前景SVGコンテナは必ず `pointer-events: none`。`auto` にするとSVG全体がノードを覆い、クリック・ホバーが死ぬ。個別の `<line>` に `pointer-events: stroke` を設定すれば線のホバーは動く。

### インタラクション設計

- **ホバー → ツールチップ**: ノードホバーで180〜200文字のサマリー、日付、ドメインバッジを表示。`position: fixed` でマウス追従。画面端にはみ出さないようクランプ。
- **ホバー → dim**: ホバーしたノードの接続先以外を opacity 0.12 に。接続先のエッジを前景SVGに昇格。
- **クリック → 詳細パネル**: 右からスライドイン（transform: translateX）。イン接続（← このイベントへ）とアウト接続（→ このイベントから）を分離表示。出典はリンク付き。
- **背景クリック → パネル閉じ**: ノード以外をクリックでパネルを閉じる。ノードの onClick で `e.stopPropagation()`。
- **探索モード → ドラッグ&ホイール**: `onPointerDown/Move/Up` + `onWheel` でキャンバスをパン。ノード上でのドラッグ開始は無視（`e.target.closest(".event-node")`）。

## ナラティブの書き方

### 原則

ステップ構成はデータの性質に合わせて自由に設計する。固定テンプレートはない。ただし以下の考え方に従う。

- **因果の流れを語れ**: 年代順に並べるのではなく、「何が何を引き起こし、なぜそうなったか」が伝わる順序を選ぶ。時系列と因果の順序は一致するとは限らない。
- **1ステップ=1つの展開**: 各ステップが「ここで状況がこう変わった」と言える単位になっているか。複数の転換を1ステップに詰め込まない。
- **最初のステップでフックをかける**: 読者が先を読みたくなる問いや象徴的な事実から始める。
- **最後のステップは物語の着地点**: 「解決した」「未解決のまま次に引き継がれた」「当初とは違う形で決着した」など、物語がどこに辿り着いたかを示す。
- **探索への橋渡しは最終ステップの後に必ず置く**: ストーリーの総括と、探索モードへの明示的な遷移ボタンを含むステップを末尾に1つ追加する。

### ステップ数の目安

- 5〜10ステップが適切。少なすぎると物語が粗くなり、多すぎるとスクロールが冗長になる。
- データ中のイベント数ではなく、**因果の転換点の数**でステップ数を決める。30ノードあっても転換点が5つなら5ステップ。

### 各ステップの設計

- `revealNodes`: そのステップの文脈で意味のあるノードだけ。4〜8個が適切。
- `focusNodes`: そのステップで最も重要な1〜2個。エッジはfocusNodes接続のみ表示。
- `timeCenter`: focusNodesの中央付近の時期。小数年（例: 2022.8 = 2022年10月頃）。
- `body`: 読者が「なるほど、だからこうなったのか」と因果を理解できる文章。200〜400字。改行（\n\n）で段落を分ける。

## ビルド手順（厳守）

### 1. テンプレートをコピー

```bash
THEME_SLUG="テーマのslug"
mkdir -p outputs/${THEME_SLUG}
cp -r templates/policy-explorer outputs/${THEME_SLUG}/policy-explorer
```

### 2. データ5ファイルを生成

以下の5ファイルを `outputs/${THEME_SLUG}/policy-explorer/src/data/` に書き込む:
- `config.js` — テーマ名・年範囲をevents.ndjsonから算出
- `graph.js` — events.ndjson + event_links.ndjson → `{ meta, nodes, edges }`
- `sourceLinks.js` — source_links.ndjson → `{ event_id: [{source_id, source_title, source_url}] }`
- `network.js` — events.ndjson + entities.ndjson → アクターネットワーク（orgNodes, orgEdges, orgNameMap）
- `narrative.js` — AI が因果分析してステップを設計

### 3. CSV + JSON も出力

- `outputs/${THEME_SLUG}/timeline_graph.json` — graph.js と同内容のJSON
- `outputs/${THEME_SLUG}/timeline_nodes.csv` — ノード一覧
- `outputs/${THEME_SLUG}/timeline_edges.csv` — エッジ一覧

### 4. npm install & build

```bash
cd outputs/${THEME_SLUG}/policy-explorer
npm install
npm run build
```

### 重要: テンプレートのコードは変更しない

`App.jsx`, `TimelineViz.jsx`, `DetailPanel.jsx`, `index.css`, `layout.js`, `main.jsx` は**一切編集しない**。テーマ固有の情報はすべて `config.js`, `graph.js`, `sourceLinks.js`, `narrative.js` の4ファイルに閉じ込める。

テンプレートに改善が必要な場合は `templates/policy-explorer/` 側を修正すること。

## 生成物

| ファイル | 役割 |
|---|---|
| `outputs/{theme-slug}/timeline_graph.json` | グラフデータ正本（ノード+エッジ+メタデータ） |
| `outputs/{theme-slug}/timeline_nodes.csv` | ノード一覧（分析用） |
| `outputs/{theme-slug}/timeline_edges.csv` | エッジ一覧（分析用） |
| `outputs/{theme-slug}/policy-explorer/` | Vite+Reactアプリ（`npm run dev` で起動） |

## 完了時に返すこと

- 描画したノード数とエッジ数
- 密なクラスター（接続度上位ノード）
- 日付欠損や参照不整合で落ちたレコード
- 横断的に現れた主要主体やテーマ間の交点
- ナラティブステップの一覧と各ステップのfocusNodes
- dev サーバーの起動方法（`cd outputs/{theme-slug}/policy-explorer && npm run dev`）

## データルール

- 正本ファイル（`data/{theme-slug}/processed/`）だけを読む。
- 欠落している情報は捏造しない。
- 証拠識別子を落とさず、後で監査できる状態にする。
- ソースコード内の日本語テキストは実際の文字で書く（Unicodeエスケープ \uXXXX はJSXテキストノード内で文字化けする）。

## よくある落とし穴

1. **SVGの pointer-events**: SVGコンテナに `pointer-events: auto` を付けるとSVG矩形全体がイベントを奪う。コンテナは `none`、個別要素に `stroke` を設定。
2. **全データを1画面に詰める衝動**: 50年分のデータを100vhに圧縮すればカードは読めなくなる。パン方式を使え。
3. **曲線の接続線**: ベジェ曲線は交差が増えると視認性が悪化する。直線で十分。
4. **ダークテーマ**: 分析ツールに暗い背景は不適。密な日本語テキストの可読性が落ちる。
5. **探索モードのスクロール問題**: スクロールテリングの中に探索を置くと、スクロールでストーリーに戻る。`position: fixed` のオーバーレイとして完全分離する。
6. **自動モード遷移**: ストーリー末尾で自動的に探索モードに切り替えると唐突。明示的なボタンクリックを挟む。
