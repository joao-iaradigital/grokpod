#!/usr/bin/env python3
"""Build the minimal, sanitized site/status.json for GrokPod from the agent host's data.
Live sources: the message index (questions/replies) and the browser sign-out log (expired sessions).
Cached sources: events.json/score.json (cards & widgets from the last transcript pull, see parse.py/score.py),
conn_overrides.json (connection blockers you or another agent reported). Run by refresh.sh.
No live data? Use `./demo.sh` instead, which serves examples/status.example.json."""
import sqlite3, json, glob, datetime, re, collections, os, sys
from config import D, TZ, AGENTS_DIR, INDEX_DB, SIGNOUTS, SELF_ID as SELF, ROSTER, QUICK_REPLIES, CONN_OVERRIDES, ROUTER_LOG, EVENTS, SCORE, AGENT_MSG_RE
NOW = datetime.datetime.now(TZ)
roster = json.load(open(ROSTER))
overrides = {k: v for k, v in json.load(open(CONN_OVERRIDES)).items() if not k.startswith('_')}
names = {p.split(os.sep)[-2]: json.load(open(p))['name'] for p in glob.glob(os.path.join(AGENTS_DIR, '*', 'profile.json'))}

def iso(ms): return datetime.datetime.fromtimestamp(ms / 1000, TZ).isoformat(timespec='seconds') if ms else None

c = sqlite3.connect(f'file:{INDEX_DB}?mode=ro', uri=True)
outs = collections.defaultdict(list)
for ts, b in c.execute("select timestamp_ms,body from messages where entry_id like 'agent-outbound-%'"):
    outs[b[:50]].append(ts)
def from_agent(ts, b): return bool(AGENT_MSG_RE.match(b)) or any(abs(ts - t) < 900000 for t in outs.get(b[:50], []))

idx = collections.defaultdict(lambda: dict(last_owner=0, last_bot=0, body=''))
turns = collections.defaultdict(list)   # (agent, turn) -> [(seq, ts)]
for a, e, r, ts, b, m in c.execute("select agent_id,entry_id,role,timestamp_ms,body,in_main_chat from messages order by timestamp_ms"):
    mm = re.match(r't(\d+)s(\d+)$', e)
    if mm: turns[(a, mm.group(1))].append((int(mm.group(2)), ts))
    if not m: continue
    d = idx[a]
    if r == 'user' and not from_agent(ts, b): d['last_owner'] = ts
    if r == 'assistant' and re.match(r't(\d+|b)s\d+$', e): d['last_bot'] = ts; d['body'] = b

def msg_ts(a, mid):
    """timestamp of a message id tNsM (cards/widgets aren't indexed; use nearest indexed row of the same turn)."""
    mm = re.match(r't(\d+)s(\d+)$', mid or '')
    if not mm: return 0
    rows = sorted(turns.get((a, mm.group(1)), []))
    before = [t for s, t in rows if s <= int(mm.group(2))]
    after = [t for s, t in rows if s > int(mm.group(2))]
    return max(before) if before else (min(after) if after else 0)

# cached transcript signals
score = json.load(open(SCORE)) if os.path.exists(SCORE) else {}
cache_ms = os.path.getmtime(SCORE) * 1000 if score else 0

# Browser sessions (live): roster entries can declare {"session": "<cookie-key substring>"}.
# If that session shows up in the sign-out log, the agent gets a broken_connection signal.
signouts = []
try: signouts = json.load(open(SIGNOUTS)).get('signedOut', [])
except Exception: pass
def session_lost(key):
    """ISO time the session matching `key` was signed out, or None if it looks fine."""
    hits = [s for s in signouts if key and key.lower() in str(s.get('key', '')).lower()]
    if not hits: return None
    at = hits[-1].get('at')
    try:
        return (datetime.datetime.fromtimestamp(at / 1000, TZ) if isinstance(at, (int, float)) else datetime.datetime.fromisoformat(str(at).replace('Z', '+00:00')).astimezone(TZ)).isoformat(timespec='seconds')
    except Exception: return NOW.isoformat(timespec='seconds')

BAD = re.compile(r'[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d ().-]{7,}\d|(R\$|US\$|C\$|\$|€|£)\s?\d[\d.,]*|\d+[.,]?\d*\s?(reais|dólares|dollars|USD|BRL|CAD)', re.I)
def clean(s):
    s = BAD.sub('…', s)
    return s if len(s) <= 90 else s[:89] + '…'


# ---------- pending question + quick replies + router log ----------
events = json.load(open(EVENTS)) if os.path.exists(EVENTS) else {}
QR = json.load(open(QUICK_REPLIES)) if os.path.exists(QUICK_REPLIES) else {}
QSENT = re.compile(r'[^.!?\n]*\?(?=\s|$)')
def clean_q(s):
    s = re.sub(r'\s+', ' ', BAD.sub('…', re.sub(r'\*\*|__|`', '', s or ''))).strip()
    return s if len(s) <= 200 else s[:199] + '…'
def last_question(text):
    """last sentence ending in '?' (prefixed by the previous sentence when it is very short)."""
    text = text or ''
    qs = list(QSENT.finditer(text))
    if not qs: return None
    q = qs[-1].group(0).strip()
    if len(q) < 45:
        prev = re.findall(r'[^.!?\n]+[.!?]', text[:qs[-1].start()])
        if prev: q = prev[-1].strip() + ' ' + q
    return q
def widget_prompt(aid, wid):
    for e in events.get(aid, {}).get('events', []):
        if e[0] == 'widget' and e[1] == wid:
            m = re.search(r'"prompt":\s*"((?:[^"\\]|\\.)*)"', e[3])
            if m: return json.loads('"' + m.group(1) + '"')
    return None
def pending_question(aid, sigs, d, s):
    kinds = {x[0] for x in sigs}
    ws = sorted({w[0] for w in s.get('open_widgets', [])}, key=lambda m: msg_ts(aid, m))
    if 'open_card' in kinds and ws:
        q = widget_prompt(aid, ws[-1])
        if q: return clean_q(q)
    if 'awaiting_reply' in kinds:
        q = last_question(d.get('body', ''))
        if not q:
            for cand in reversed(s.get('q_after', [])):
                q = last_question(cand)
                if q: break
        if q: return clean_q(q)
    return None
def router_entries():
    out = collections.defaultdict(list)
    p = ROUTER_LOG
    if not os.path.exists(p): return out
    for line in open(p, encoding='utf-8'):
        line = line.strip()
        if not line: continue
        try: e = json.loads(line)
        except Exception: print('WARN bad router_log line', file=sys.stderr); continue
        key = e.get('agent_id') or e.get('id')
        if not key:
            nm = (e.get('agent') or e.get('agent_name') or e.get('name') or '').strip().lower()
            key = next((i for i, n in names.items() if n.lower() == nm), None)
        def ms(v):
            if v is None: return None
            if isinstance(v, (int, float)): return int(v if v > 1e11 else v * 1000)
            dt = datetime.datetime.fromisoformat(str(v).replace('Z', '+00:00'))
            if dt.tzinfo is None: dt = dt.replace(tzinfo=TZ)
            return int(dt.timestamp() * 1000)
        try: tm = ms(e.get('time') or e.get('ts') or e.get('timestamp'))
        except Exception: tm = None
        if key and tm: out[key].append(dict(t=tm, kind=str(e.get('kind', '')).lower(), answer=str(e.get('answer', '') or e.get('reply', '')), result=str(e.get('result', '')).lower(),
                                            snooze_until=ms(e.get('snooze_until')) if e.get('snooze_until') else None))
    return out
ROUTER = router_entries()
NOW_MS = int(NOW.timestamp() * 1000)

agents = []
for aid, n in names.items():
    meta = roster.get(aid)
    if not meta:
        meta = {'room': 'HQ', 'race': 'operator', 'guessed': True}
        print(f'WARN unmapped agent {aid} {n} -> HQ/operator', file=sys.stderr)
    if meta.get('omit'): continue
    d = idx.get(aid, {}); s = score.get(aid, {})
    sig = []  # (signal, ask_ms, reason)
    lj, lb = d.get('last_owner', 0), d.get('last_bot', 0)
    # 1) awaiting reply (live)
    if aid != SELF and lb > lj and ('?' in d.get('body', '')[-300:] or (lb <= cache_ms and any('?' in q for q in s.get('q_after', [])))):
        sig.append(('awaiting_reply', lb, 'Asked you a question in chat; no reply yet'))
    # 2) open cards/widgets (cached from last transcript pull; dropped if the owner has written to the agent since)
    if aid != SELF and not (lj and lj > cache_ms):
        ws = {w[0] for w in s.get('open_widgets', [])}
        cs = [x[0] for x in s.get('open_cards', [])]
        if ws or cs:
            t = min([msg_ts(aid, m) for m in list(ws) + cs if msg_ts(aid, m)] or [lb or int(cache_ms)])
            parts = []
            if ws: parts.append(f"{len(ws)} question card{'s' if len(ws) > 1 else ''}")
            if cs: parts.append(f"{len(cs)} email draft{'s' if len(cs) > 1 else ''}")
            sig.append(('open_card', t, ' + '.join(parts) + ' waiting for your answer/Send'))
    # 3) broken connection
    if meta.get('session'):
        since = session_lost(meta['session'])
        if since:
            t = int(datetime.datetime.fromisoformat(since).timestamp() * 1000)
            sig.append(('broken_connection', t, meta.get('session_reason') or f"Browser session '{meta['session']}' signed out; sign in again"))
    if aid in overrides:
        o = overrides[aid]
        sig.append(('broken_connection', int(datetime.datetime.fromisoformat(o['since']).timestamp() * 1000), o['reason']))
    # router log: answered after the ask -> reply/card signals cleared; snoozed -> hidden until snooze ends
    snoozed_until = None
    if sig and aid in ROUTER:
        ask_first = min(x[1] for x in sig)
        for e in ROUTER[aid]:
            if e['result'] in ('failed', 'error', 'bounced'): continue
            is_snooze = e['kind'] == 'snooze' or e['snooze_until'] or e['answer'].strip().lower().startswith('snooze')
            if is_snooze:
                until = e['snooze_until'] or e['t'] + 86400000
                if e['t'] >= ask_first and until > NOW_MS: snoozed_until = max(snoozed_until or 0, until)
            else:
                sig = [x for x in sig if not (x[0] in ('awaiting_reply', 'open_card') and e['t'] > x[1])]
                if not sig: break
    if sig and not snoozed_until:
        first = min(sig, key=lambda x: x[1])  # oldest ask drives the bubble
        reason = '; '.join(dict.fromkeys(x[2] for x in sig))
        q = pending_question(aid, sig, d, s)
        conf = QR.get(aid) or {}
        btns = conf.get('buttons') or []
        if btns and conf.get('match') and (not q or conf['match'].lower() not in q.lower()):
            btns = []; conf = {}  # question changed since the buttons were chosen -> don't offer stale answers/text
        if conf.get('question'): q = clean_q(conf['question'])
        qr = [dict(label=b['label'][:24], reply=clean_q(b['reply']), **({'snooze': True} if b.get('snooze') else {})) for b in btns[:4]]
        fallback = 'grokbot' if (not qr or conf.get('fallback') == 'grokbot') else None
        agents.append(dict(name=n, room=meta['room'], race=meta['race'], needs_you=True,
                           reason=clean(reason), signal='+'.join(dict.fromkeys(x[0] for x in sig)),
                           ask_ts=iso(first[1]), id=aid, question=q, quick_replies=qr, fallback=fallback))
    else:
        a = dict(name=n, room=meta['room'], race=meta['race'], needs_you=False,
                 reason=None, signal=None, ask_ts=None, id=aid)
        if snoozed_until: a['snoozed_until'] = iso(snoozed_until)
        agents.append(a)
agents.sort(key=lambda a: (a['room'], a['name'].lower()))
out = dict(updated_at=NOW.isoformat(timespec='seconds'),
           cards_cached_at=iso(cache_ms),
           agents=agents)
js = json.dumps(out, ensure_ascii=False, indent=1)
assert not re.search(r'[\w.+-]+@[\w-]+\.\w', js), 'email leaked'
open(os.path.join(D, 'site', 'status.json'), 'w').write(js)
print(f"status.json: {len(agents)} agents, {sum(a['needs_you'] for a in agents)} need you")
