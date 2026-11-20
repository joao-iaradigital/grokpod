"""Shared settings for the GrokPod scripts. Everything machine- or person-specific comes from env vars
(see .env.example). Defaults point at the example files in this repo so a fresh clone runs in demo mode."""
import os, re, datetime
D = os.path.dirname(os.path.abspath(__file__))

def env(name, default=None):
    v = os.environ.get(name)
    return v if v not in (None, '') else default

# Where the agent host keeps its data (agent profiles + a SQLite message index).
AGENT_DATA = env('GROKPOD_AGENT_DATA', os.path.expanduser('~/agent-data'))
AGENTS_DIR = env('GROKPOD_AGENTS_DIR', os.path.join(AGENT_DATA, 'agents'))          # <id>/profile.json -> {"name": ...}
INDEX_DB = env('GROKPOD_INDEX_DB', os.path.join(AGENT_DATA, 'search-index.db'))       # messages(agent_id, entry_id, role, timestamp_ms, body, in_main_chat)
SIGNOUTS = env('GROKPOD_SIGNOUTS_JSON', os.path.join(AGENT_DATA, 'chrome-cookie-signouts.json'))  # {"signedOut":[{"key","at"}]}
# Folder of transcript dumps (one .txt per agent) used by parse.py.
TRANSCRIPTS_DIR = env('GROKPOD_TRANSCRIPTS_DIR', os.path.join(D, 'transcripts'))
# The agent that runs GrokPod itself (excluded from its own board).
SELF_ID = env('GROKPOD_SELF_ID', '')

# Config files (real ones are git-ignored; *.example.* versions are committed).
def cfg(name):
    real = os.path.join(D, name)
    stem, ext = os.path.splitext(name)
    return real if os.path.exists(real) else os.path.join(D, 'examples', f'{stem}.example{ext}')
ROSTER = env('GROKPOD_ROSTER', cfg('roster.json'))
QUICK_REPLIES = env('GROKPOD_QUICK_REPLIES', cfg('quick_replies.json'))
CONN_OVERRIDES = env('GROKPOD_CONN_OVERRIDES', cfg('conn_overrides.json'))
ROUTER_LOG = env('GROKPOD_ROUTER_LOG', os.path.join(D, 'router_log.jsonl'))
EVENTS = os.path.join(D, 'events.json')
SCORE = os.path.join(D, 'score.json')

# Messages the owner's own agents send each other look like "user" messages in the index.
# Lines matching this regex are treated as agent-to-agent traffic, not the owner talking.
AGENT_MSG_RE = re.compile(env('GROKPOD_AGENT_MSG_REGEX', r'^([A-Z][^\n]{0,40} here[.,:]|Routine check)'))

_off = env('GROKPOD_UTC_OFFSET_HOURS')
TZ = datetime.timezone(datetime.timedelta(hours=float(_off))) if _off else datetime.datetime.now().astimezone().tzinfo
