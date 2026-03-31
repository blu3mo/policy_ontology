---
name: build-timeline-view
description: 日本の政策・国政調査データから、時系列と関係グラフの出力を生成する可視化スキル。少子化、物価高、防衛、移民、生成AI、医療、エネルギー、教育、農業、防災のいずれでも使える。
context: fork
agent: timeline-viz-builder
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
model: sonnet
---
テーマ: $ARGUMENTS

## 目的
`outputs/` 以下に、問題の全体像を視認できる可視化用成果物を出す。

## 生成物
- `outputs/timeline_graph.json`
- `outputs/timeline_nodes.csv`
- `outputs/timeline_edges.csv`
- `outputs/timeline_view.html`

## 配置方針
- 縦軸は時間を基本とする。
- 横方向はグラフ構造、クラスター、制度過程の近さ、関係密度を反映する。
- 各ノードには日付、タイトル、イベント類型、主要主体、theme_bucket を含める。
- 公式制度過程と制度外イベントが混じる場合は、視覚上区別できるようにする。
- 可能ならクリック時に資料や証拠へたどれる情報を残す。

## データルール
- 正本ファイルだけを読む。
- 欠落している情報は捏造しない。
- 証拠識別子を落とさず、後で監査できる状態にする。
- 10 想定テーマのうち複数テーマにまたがる場合は、クラスターの重なりが見える形にする。

## 完了時に返すこと
- 描画したノード数とエッジ数
- 密なクラスター
- 日付欠損や参照不整合で落ちたレコード
- 横断的に現れた主要主体やテーマ間の交点
