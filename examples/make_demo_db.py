#!/usr/bin/env python3
"""Create examples/search-index.example.db: a tiny fake message index so publish_status.py runs end to end
without a real agent host. Schema matches what the scripts read."""
import sqlite3, os, datetime
D = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(D, 'search-index.example.db')
if os.path.exists(p): os.remove(p)
c = sqlite3.connect(p)
c.execute('create table messages(agent_id text, entry_id text, role text, timestamp_ms integer, body text, in_main_chat integer)')
now = int(datetime.datetime.now().timestamp() * 1000); h = 3600 * 1000
rows = [
 ('demo-0003', 't1u', 'user', now - 30*h, 'Track the product pages and tell me what changed.', 1),
 ('demo-0003', 't1s1', 'assistant', now - 29*h, 'Done, here is the first sweep. Want me to turn this into a recurring digest?', 1),
 ('demo-0005', 't4s2', 'assistant', now - 20*h, 'Your Thursday is packed. Should I block Thursday afternoon for deep work?', 1),
 ('demo-0009', 't2s1', 'assistant', now - 3*h, 'Last test brought 14 sign-ups. Should I run the next growth experiment this week?', 1),
 ('demo-0010', 't3u', 'user', now - 2*h, 'Send me the numbers.', 1),
 ('demo-0010', 't3s1', 'assistant', now - 2*h + 60000, 'Sent. Numbers are in the sheet.', 1),
 ('demo-0013', 't7s1', 'assistant', now - 5*h, 'I found a charge I could not match. Is this charge from the bookstore yours?', 1),
 ('demo-0018', 't9s1', 'assistant', now - 1*h, 'Final cut is uploaded. Can I delete the first cut of the video?', 1),
]
c.executemany('insert into messages values (?,?,?,?,?,?)', rows); c.commit()
print('wrote', p)
