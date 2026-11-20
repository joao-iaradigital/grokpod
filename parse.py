"""Parse transcript dumps (one .txt per agent, JSON lines after a 'Transcript of agent "<name>" (<id>)' header)
into events.json: questions asked, cards/widgets opened, answers, owner messages. Feeds score.py."""
import json,re,glob,os,sys
from config import TRANSCRIPTS_DIR, EVENTS
A=TRANSCRIPTS_DIR.rstrip('/')+'/'
latest={}
for f in glob.glob(A+'*.txt'):
    head=open(f).read(600)
    m=re.search(r'Transcript of agent "([^"]+)" \(([0-9a-f-]{36})\), positions (\d+)\S(\d+) of (\d+)',head)
    if not m: continue
    aid=m.group(2); mt=os.path.getmtime(f)
    key=(int(m.group(4)),mt)
    if aid not in latest or key>(latest[aid][3],latest[aid][0]): latest[aid]=(mt,f,m.group(1),int(m.group(4)),int(m.group(5)))
CONN=re.compile(r'desconect|QR|needsAuth|precisa (?:re)?autenticar|reconect|sess[aã]o (?:expir|caiu|bloque)|captcha|Verify it.s you|login (?:expir|caiu)|not connected|disconnected|authentication_required|sem navegador|no browser',re.I)
out={}
for aid,(mt,f,name,last,total) in latest.items():
    ev=[]; pending_tool={}
    for l in open(f):
        if not l.startswith('{'): continue
        try:o=json.loads(l)
        except: continue
        c=o['message']['content']
        for b in (c if isinstance(c,list) else [{'type':'text','text':c}]):
            t=b['type']
            if o['role']=='user' and t=='text':
                s=b['text']; ts=re.search(r'<timestamp>([^<]+)</timestamp>',s); ts=ts.group(1) if ts else None
                s2=re.sub(r'<memory_context>.*?</memory_context>','',s,flags=re.S)
                if re.search(r'\[Answering your question (t\d+s\d+)',s2): ev.append(('answer',re.search(r'\[Answering your question (t\d+s\d+)',s2).group(1),ts,s2[-200:]))
                elif 'pressed Send on your' in s2:
                    to=re.search(r' to ([^\s.]+@[^\s.]+\.[^\s]+?)\.',s2); ev.append(('card_sent',to.group(1) if to else '?',ts,''))
                elif re.search(r'discard',s2,re.I) and 'card' in s2: ev.append(('card_discarded','',ts,s2[:200]))
                elif re.search(r'\[t\d+u\]',s2): ev.append(('owner',re.search(r'\[t\d+u\]',s2).group(0),ts,re.sub(r'\s+',' ',s2.split(']')[-1])[:150]))
                elif '[agent]' in s2: ev.append(('agent_in','',ts,re.search(r'agents: ([^(]+)',s2).group(1) if re.search(r'agents: ([^(]+)',s2) else ''))
                elif 'Automation' in s2 or 'background task' in s2.lower(): ev.append(('auto','',ts,re.sub(r'\s+',' ',s2)[:220]))
                else: ev.append(('sys','',ts,re.sub(r'\s+',' ',s2)[:150]))
            elif t=='tool_use':
                pending_tool[b['id']]=b
                if b['name']=='SendToUser':
                    i=b['input'] if isinstance(b['input'],dict) else {'content':b['input']}
                    if i.get('type')=='widget' or 'widget' in i: ev.append(('widget','',None,json.dumps(i.get('widget'),ensure_ascii=False)[:200],b['id']))
                    else: ev.append(('say','',None,str(i.get('content',''))[:400],b['id'],i.get('cards')))
                elif b['name']=='CallDynamicTool' and isinstance(b['input'],dict):
                    tn=b['input'].get('toolName')
                    if tn in('SendToAgent',): ev.append(('agent_out','',None,str(b['input'].get('arguments',{}).get('message',''))[:200]))
            elif t=='tool_result':
                r=str(b.get('result',''))
                mid=re.search(r'Message sent to user\. \(id: (t\d+s\d+)\)',r)
                if mid:
                    for e in reversed(ev):
                        if e[0] in('widget','say') and len(e)>=5 and e[4]==b.get('tool_use_id'):
                            ev[ev.index(e)]=e[:1]+(mid.group(1),)+e[2:]; break
                dm=re.search(r'Draft (\w+) from (\S+) to (\S+) is now an editable card.*?\(message id: (t\d+s\d+)\)',r,re.S)
                if dm: ev.append(('card_open',dm.group(4),None,f'{dm.group(1)} to {dm.group(3)}'))
                elif re.search(r'\bcard\b',r) and 'SendToUser' not in r[:80]: ev.append(('card_other','',None,re.sub(r'\s+',' ',r)[:200]))
    out[aid]=dict(name=name,file=f,last_pos=last,total=total,events=ev)
json.dump(out,open(EVENTS,'w'),ensure_ascii=False,indent=0)
for aid,d in sorted(out.items(),key=lambda x:x[1]['name']):
    print('=====',d['name'],aid[:8],'window',d['last_pos'],'/',d['total'])
    for e in d['events'][-14:]:
        if e[0] in('auto','sys') : print('  ',e[0],e[2] or '',e[3][:120])
        else: print('  ',e[0],e[1],e[2] or '',str(e[3])[:150].replace('\n',' '), (e[5] if len(e)>5 and e[5] else ''))
