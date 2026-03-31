#!/usr/bin/env python3
import json, sys, os, datetime
state = sys.argv[1] if len(sys.argv) > 1 else 'event'
os.makedirs('.claude/logs', exist_ok=True)
path = '.claude/logs/subagent_events.ndjson'
record = {
    'timestamp': datetime.datetime.utcnow().isoformat() + 'Z',
    'state': state,
}
try:
    payload = json.load(sys.stdin)
    record['payload'] = payload
except Exception:
    pass
with open(path, 'a', encoding='utf-8') as f:
    f.write(json.dumps(record, ensure_ascii=False) + '
')
