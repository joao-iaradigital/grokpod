#!/usr/bin/env python3
"""One-off audit: who needs me, and why? Prints one line per agent and writes audit.json with the evidence.
This was the first prototype before the dashboard existed. publish_status.py is the trimmed, production version."""
import sqlite3, json, glob, datetime, re, collections, os
from config import D, TZ, AGENTS_DIR, INDEX_DB, SELF_ID, ROSTER, CONN_OVERRIDES, SCORE, AGENT_MSG_RE
NOW = datetime.datetime.now(TZ)
def ts(ms): return datetime.datetime.fromtimestamp(ms / 1000, TZ).strftime('%Y-%m-%d %H:%M') if ms else None
names = {p.split(os.sep)[-2]: json.load(open(p))['name'] for p in glob.glob(os.path.join(AGENTS_DIR, '*', 'profile.json'))}
roster = json.load(open(ROSTER))
conn = {k: v for k, v in json.load(open(CONN_OVERRIDES)).items() if not k.startswith('_')}
c = sqlite3.connect(f'file:{INDEX_DB}?mode=ro', uri=True)
outs = collections.defaultdict(list)
for ts_, b in c.execute("select timestamp_ms,body from messages where entry_id like 'agent-outbound-%'"): outs[b[:50]].append(ts_)
def from_agent(t, b): return bool(AGENT_MSG_RE.match(b)) or any(abs(t - x) < 900000 for x in outs.get(b[:50], []))
idx = collections.defaultdict(lambda: dict(last_any=0, last_owner=0, last_bot=0, last_bot_body=''))
for a, e, r, t, b, m in c.execute("select agent_id,entry_id,role,timestamp_ms,body,in_main_chat from messages order by timestamp_ms"):
    d = idx[a]; d['last_any'] = max(d['last_any'], t)
    if not m: continue
    if r == 'user' and not from_agent(t, b): d['last_owner'] = t
    if r == 'assistant' and re.match(r't(\d+|b)s\d+$', e): d['last_bot'] = t; d['last_bot_body'] = b
ev = json.load(open(SCORE)) if os.path.exists(SCORE) else {}
snap = []
for aid, n in sorted(names.items(), key=lambda x: x[1].lower()):
    if aid == SELF_ID: continue
    d = idx.get(aid, {}); s = ev.get(aid, {})
    sig, why = [], []
    lo, lb = d.get('last_owner', 0), d.get('last_bot', 0)
    body = d.get('last_bot_body', '')
    if lb > lo and ('?' in body[-300:] or s.get('q_after')):
        age = (NOW - datetime.datetime.fromtimestamp(lb / 1000, TZ)).days
        sig.append('awaiting_reply'); why.append(f'Asked a question {age}d ago with no reply')
    ow, oc = s.get('open_widgets', []), s.get('open_cards', [])
    if ow: sig.append('open_card'); why.append(f'{len({w[0] for w in ow})} unanswered question card(s)')
    if oc:
        if 'open_card' not in sig: sig.append('open_card')
        why.append(f'{len(oc)} draft card(s) created and no Send event seen (discards are invisible)')
    if aid in conn: sig.append('broken_connection'); why.append(conn[aid]['reason'])
    snap.append(dict(agent=n, id=aid, room=(roster.get(aid) or {}).get('room', '?'), needs_you=bool(sig), signals=sig,
                     reason=' | '.join(why) or 'Nothing waiting on you', last_activity=ts(d.get('last_any')),
                     last_owner_msg=ts(lo), last_bot_msg_to_owner=ts(lb)))
out = dict(generated_at=NOW.isoformat(timespec='minutes'),
           caveats=['needs_you=true when ANY signal fires; stale questions from dormant bots still count',
                    'Card resolution: Send events are visible, Discard is not, so open-card counts are upper bounds',
                    'Only the transcript window that was read is scanned for cards/widgets'],
           agents=snap)
json.dump(out, open(os.path.join(D, 'audit.json'), 'w'), ensure_ascii=False, indent=1)
for a in snap:
    print(('YES ' if a['needs_you'] else 'no  ') + a['agent'][:26].ljust(26), a['room'][:10].ljust(10), a['last_activity'], a['signals'], a['reason'][:120])
