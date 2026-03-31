#!/usr/bin/env python3
import json, sys

try:
    payload = json.load(sys.stdin)
except Exception:
    print(json.dumps({"decision": "approve"}, ensure_ascii=False))
    raise SystemExit

path = payload.get("tool_input", {}).get("file_path", "")
warning = None
if path.startswith("/etc") or path.startswith("/usr"):
    warning = "システム領域への書き込みはこのプロジェクトでは想定していません。"
elif "secrets" in path.lower() or ".env" in path.lower():
    warning = "機密設定ファイルへの書き込みの可能性があります。内容を再確認してください。"

if warning:
    print(json.dumps({"decision": "approve", "message": warning}, ensure_ascii=False))
else:
    print(json.dumps({"decision": "approve"}, ensure_ascii=False))
