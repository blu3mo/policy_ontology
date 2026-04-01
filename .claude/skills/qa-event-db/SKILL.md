---
name: qa-event-db
description: 日本の国政調査データベースについて、欠損、重複、弱い根拠、参照切れ、スキーマ逸脱を点検する QA スキル。
allowed-tools: Read, Grep, Glob, Bash
model: sonnet
---
テーマ: $ARGUMENTS

## 点検項目
- スキーマ違反
- 重複または重複に近いイベント
- 日付や URL の欠損
- 要約の弱さ
- 根拠の弱い高 confidence リンク
- ファイル間の参照切れ
- relation_type の乱用
- 疑惑・判断・反応の区別が崩れていないか
- 自治体、司法、海外、民間、当事者団体の観点が空白になっていないか
- 予算、執行、副作用、再修正の観点が抜けていないか

## 対象ファイル
- `data/{theme-slug}/processed/events.ndjson`
- `data/{theme-slug}/processed/entities.ndjson`
- `data/{theme-slug}/processed/source_links.ndjson`
- `data/{theme-slug}/processed/event_links.ndjson`
- `schemas/*.json`

## 出力
`outputs/qa_report_$TODAY.md` に次の構成で書く。
1. 致命的エラー
2. 警告
3. 推奨修正
4. 人手確認が必要なレコード
5. 公開前に最低限やるべき次アクション
