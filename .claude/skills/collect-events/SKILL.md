---
name: collect-events
description: 日本の国政・行政・政策・政治問題について、公式制度過程だけでなく、その外側の出来事も含めてイベント正本とイベント単位の資料要約を作る抽出スキル。10 の代表テーマを横断的にカバーできるように設計している。
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, WebSearch, WebFetch
model: sonnet
---
テーマ: $ARGUMENTS

## 目的
`data/processed/` 以下の正本データを拡張する。

## 出力先
- `data/processed/events.ndjson`
- `data/processed/entities.ndjson`
- `data/processed/source_links.ndjson`

## 最初にやること
1. 既存の正本ファイルを読んで重複を避ける。
2. `docs/想定テーマ10選.md` を読み、このテーマがどの観点を要求するか確認する。
3. 必要なら `research-collector` や `source_intake_*.md` を参照する。

## 手順
1. 次のような**分離可能な出来事**ごとにイベントを切る。
   - 法案提出、修正、成立、廃案
   - 閣議決定、対策パッケージ、骨太方針、予算措置
   - 通知、告示、通達、省令、制度改正、Q&A 改定
   - 審議会・検討会・有識者会議の開催や資料公開
   - 国会質疑、委員会答弁、大臣発言、参考人意見
   - 行政処分、調査開始、勧告、改善命令
   - 判決、仮処分、提訴、上訴
   - 政党・議員・業界・企業の重要な応答
   - 重大事故、被害拡大、災害、サイバー事案、企業不祥事
   - 自治体の条例、意見書、独自対応
   - 海外当局や国際機関の決定、公表、勧告
   - 被害者団体、NPO、学会、研究者の調査や提言
   - 調査報道や原資料付き特集の公開
   - 統計公表、需給変化、価格変動、人口動態の変化
2. 各イベントについて、可能なら `event_domain` を次のいずれかで補う。
   - `公式制度過程`
   - `社会的外部要因`
   - `制度への入力・反応`
3. 人物、組織、日付、場所を正規化する。
4. 各イベントに 1 件以上の資料をひも付ける。
5. イベントと資料のペアごとに、**日本語 300〜500 文字程度**のイベント特化要約を書く。
6. 不確実性を必ず保存する。
7. 政策形成との接点がある場合は、要約か `why_relevant` に明記する。
8. 次の横断観点が欠けていないか確認する。
   - 予算・税制・基金・補助金
   - 自治体実務や先行事例
   - 海外制度や国際ルール
   - 企業・業界団体・当事者団体の反応
   - 訴訟・監督当局・第三者委員会
   - 実施後の副作用と修正

## イベント最低項目
- `event_id`
- `topic`
- `title`
- `summary`
- `event_date_text`
- `event_date_start`
- `event_date_end`
- `timezone`
- `places`
- `people`
- `organizations`
- `source_ids`
- `event_type`
- `confidence`
- `notes_uncertainty`

## 推奨追加項目
- `event_domain`
- `policy_stage`
- `jurisdiction`
- `theme_bucket`

## 資料リンク最低項目
- `link_id`
- `event_id`
- `source_id`
- `source_title`
- `source_url`
- `source_type`
- `publisher`
- `published_at`
- `event_scoped_summary_ja`
- `why_relevant`
- `evidence_snippet`

## 品質基準
- 追記中心で更新する
- 出典が支える範囲を超えて書かない
- 事実要約は簡潔にする
- 資料が強い場合は一次資料を優先する
- 公式制度過程だけに偏らず、必要な外部イベントを落とさない
- 外部イベントを制度イベントと混同しない
- テーマを一つに固定しすぎず、隣接領域への接続を残す

## 完了時に返すこと
- 追加したイベント件数
- 追加した資料リンク件数
- 人手確認が必要な重複候補
- 足りていない領域
- 10 テーマ横断で未回収の観点
