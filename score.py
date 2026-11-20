"""Score events.json per agent: open questions, unanswered cards/widgets, connection complaints -> score.json."""
import json,re
from config import EVENTS, SCORE
ev=json.load(open(EVENTS))
CONN=re.compile(r'desconect|QR\b|needsAuth|precisa (?:re)?autenticar|reconect|sess[aã]o|captcha|Verify it.s you|login|not connected|disconnected|authentication_required|sem navegador|no browser|bloquead',re.I)
res={}
for aid,d in ev.items():
    E=d['events']
    lj=max([i for i,e in enumerate(E) if e[0] in('owner','answer','card_sent')],default=-1)
    after=E[lj+1:]
    says=[e for e in after if e[0]=='say']
    widgets=[e for e in after if e[0]=='widget']
    answered={e[1] for e in E if e[0]=='answer'}
    open_w=[e for e in E if e[0]=='widget' and e[1] not in answered and E.index(e)>lj]
    opened=[e for e in E if e[0]=='card_open']
    sent=[e[1] for e in E if e[0]=='card_sent']
    open_cards=[e for e in opened if not any(s in e[3] for s in sent)]
    last_say=[e for e in E if e[0]=='say'][-1:] 
    q = [e for e in says[-2:] if '?' in e[3][-250:]]
    conn=[ (e[0],e[3][:160]) for e in E[-12:] if e[0] in('say','agent_out') and CONN.search(e[3])]
    res[aid]=dict(name=d['name'],lj=E[lj][3][:100] if lj>=0 else None,lj_ts=E[lj][2] if lj>=0 else None,
        n_says_after=len(says),q_after=[e[3][-160:] for e in q],open_widgets=[(e[1],e[3][:120]) for e in open_w],
        open_cards=[(e[1],e[3]) for e in open_cards],conn=conn,last_say=last_say[0][3][:160] if last_say else None)
json.dump(res,open(SCORE,'w'),ensure_ascii=False,indent=1)
for aid,r in sorted(res.items(),key=lambda x:x[1]['name']):
    print(f"## {r['name']} | lastOwner[{r['lj_ts']}]: {r['lj']!s:.70} | says_after={r['n_says_after']}")
    if r['q_after']: print('   Q:',[x[-110:].replace('\n',' ') for x in r['q_after']])
    if r['open_widgets']: print('   W:',r['open_widgets'])
    if r['open_cards']: print('   C:',len(r['open_cards']),[c[1][:40] for c in r['open_cards']])
    if r['conn']: print('   CONN:',[c[1][:130].replace('\n',' ') for c in r['conn'][-2:]])
