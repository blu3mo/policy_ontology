---
name: link-events
description: 日本の国政・政策論点データについて、イベント間の関係を証拠付きで追加するスキル。制度内外のつながりを疎で強く張る。
context: fork
agent: relation-linker
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
model: sonnet
---
テーマ: $ARGUMENTS

## 目的
`data/processed/event_links.ndjson` に、証拠付きのイベント間関係を追記する。

## 入力
- `data/processed/events.ndjson`
- `data/processed/source_links.ndjson`
- `schemas/event_link.schema.json`

## 方法
1. 対象テーマのイベント集合を読み込む。
2. 各イベントを起点に、共有主体、制度過程、日付連続性、資料中の明示参照、行政手続や国会手続の連鎖を見て関連候補を探す。
3. 問題顕在化 → 論点形成 → 審議 → 執行 → 反応 → 再修正 の流れを強く意識する。
4. 自治体・海外・企業・団体・研究者・司法のイベントが制度過程に接続する場合は、証拠付きで拾う。
5. 説明が明快に書ける場合だけリンクを張る。
6. 密な推測グラフではなく、疎で強いリンクを優先する。

## 各リンクの必須項目
- `link_id`
- `from_event_id`
- `to_event_id`
- `relation_type`
- `rationale`
- `evidence`
- `confidence`

## 証拠として使ってよいもの
- 資料内の明示的参照
- 同一主体による制度的な連続行為
- 法案・審議会・行政処分・訴訟などの進行関係
- 国会答弁や会見での明示的言及
- 予算・統計・需給・価格・被害拡大などの指標を介した接続

## 禁止
- 話題が近いだけでリンクしない
- 裏の意図や非公開調整を推定しない
- 弱い根拠で高 confidence を付けない

## 完了時に返すこと
- 提案リンク数
- 高 confidence リンク数
- つながりが弱いクラスター
- 追加収集が必要な箇所
- 主要な接続パターン
