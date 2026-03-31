#!/usr/bin/env python3
import json, sys, os

try:
    payload = json.load(sys.stdin)
except Exception:
    raise SystemExit

path = payload.get("tool_input", {}).get("file_path", "")
if not path.endswith('.ndjson'):
    raise SystemExit

if not os.path.exists(path):
    raise SystemExit

errors = []
with open(path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f, start=1):
        line = line.strip()
        if not line:
            continue
        try:
            json.loads(line)
        except Exception as e:
            errors.append(f"{path}:{i}: JSON として読めません: {e}")

if errors:
    print("
".join(errors))
