'use strict';
// GrokPod v1 - procedural pixel office. No external assets.
// Rooms are just areas of your life/work. Rename labels and keys freely; roster.json must use the same keys.
const W = 512, H = 288, TZ = Intl.DateTimeFormat().resolvedOptions().timeZone; // shows times in the viewer's local zone
const ROOMS = {
  WORK:     {x:0,   y:0,   w:192, h:136, label:'WORK',               floor:'#b9a7d9', wall:'#5b3f8f'},
  PROJ_A:   {x:192, y:0,   w:96,  h:136, label:'PROJECT A',          floor:'#f2b8c6', wall:'#a1475f'},
  PROJ_B:   {x:288, y:0,   w:96,  h:136, label:'PROJECT B',          floor:'#a8d8b9', wall:'#2f7a55'},
  RESEARCH: {x:384, y:0,   w:128, h:136, label:'RESEARCH & CONTENT', floor:'#f2d49b', wall:'#9a6a1f'},
  HOME:     {x:0,   y:152, w:176, h:136, label:'HOME & ERRANDS',     floor:'#a9c7ec', wall:'#2e5d99'},
  LEISURE:  {x:176, y:152, w:128, h:136, label:'LEISURE',           floor:'#f5a97f', wall:'#a2502a'},
  HQ:       {x:304, y:152, w:208, h:136, label:'HQ',                floor:'#cfd3dc', wall:'#4a5068'},
};
const RACE = {
  operator:{label:'Operator', look:'mechanic in overalls'},
  collaborator:{label:'Collaborator', look:'builder / artist'},
  consultant:{label:'Consultant', look:'wizard in a robe'},
  approver:{label:'Approver', look:'squire with a sealed letter'},
  observer:{label:'Observer', look:'floating one-eyed Beholder'},
};
const SIGNAL = {awaiting_reply:'Awaiting your reply', open_card:'Open card (approval/question)', broken_connection:'Broken connection'};
const K = '#1b1426';
// Quick replies are POSTed silently to this Site's own proxy route (.herenow/proxy.json);
// here.now forwards them to the GrokPod Router webhook and adds the Authorization header server-side.
const REPLY_PATH = '/api/reply';
const SNOOZE_MS = 24*36e5;
const ENVELOPE_MS = 10*1000; // envelope-with-check shows this long after a successful reply; agent stays seated until the next refresh
// Local marks (this device only): {id:{kind:'sent'|'snooze', at, ask_ts, until?}}
const LS_KEY='grokpod.local.v1';
let local={};try{local=JSON.parse(localStorage.getItem(LS_KEY)||'{}')||{}}catch(e){local={}}
function saveLocal(){try{localStorage.setItem(LS_KEY,JSON.stringify(local))}catch(e){}}
// mark that hides the agent: 'sent' until the next status refresh (status updated after the tap), 'snooze' for 24h
function markOf(a){
  const m=a&&local[a.id]; if(!m||!a.needs_you||m.ask_ts!==a.ask_ts)return null;
  if(m.kind==='snooze')return Date.now()<m.until?m:null;
  const upd=data&&data.updated_at?new Date(data.updated_at).getTime():0;
  return upd<m.at?m:null;
}
function waiting(a){return !!(a&&a.needs_you)&&!markOf(a)}
const rnd = (a,b)=>a+Math.random()*(b-a);
function hash(s){let h=2166136261;for(const ch of s){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}

// ---------- sprite factory ----------
function mk(w,h,fn){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');fn((x,y,col,ww=1,hh=1)=>{g.fillStyle=col;g.fillRect(x,y,ww,hh)},g);return c}
function outlined(src){
  const sil=mk(src.width,src.height,(P,g)=>{g.drawImage(src,0,0);g.globalCompositeOperation='source-in';g.fillStyle=K;g.fillRect(0,0,src.width,src.height)});
  return mk(src.width+2,src.height+2,(P,g)=>{for(const[dx,dy]of[[0,1],[2,1],[1,0],[1,2]])g.drawImage(sil,dx,dy);g.drawImage(src,1,1)});
}
const SKIN=['#f6cfa6','#e0a878','#b07548','#7d4c2c'], HAIR=['#3a2516','#6b4423','#d9b25a','#222','#9b3b2a','#c9c9c9'];
const cache=new Map();
function sprite(race,v,frame,extra){
  const key=race+'|'+v+'|'+frame+'|'+(extra||'');
  if(cache.has(key))return cache.get(key);
  const skin=SKIN[v%4], hair=HAIR[(v>>3)%6];
  let s;
  if(race==='observer'){
    const blink=frame===3;
    s=outlined(mk(14,14,(P)=>{
      const body='#c0507e', dark='#8f3560';
      for(let y=0;y<14;y++)for(let x=0;x<14;x++){if((x-6.5)**2+(y-8.5)**2<=27)P(x,y,y>10?dark:body)}
      for(const sx of[2,5,8,11]){P(sx,1,dark,1,3);P(sx,0,'#fff');P(sx,1,'#2a7a4a')}
      if(blink){P(4,7,K,6,1)}else{
        for(let y=4;y<11;y++)for(let x=3;x<11;x++){if((x-6.5)**2+(y-7.5)**2<=9.5)P(x,y,'#fffbe8')}
        P(5,6,'#2fae6a',3,3);P(6,7,K,1,1);P(5,6,'#bff5d4');
      }
      P(4,11,K,6,1);P(5,11,'#fff');P(7,11,'#fff');P(9,11,'#fff');
    }));
  } else {
    s=outlined(mk(12,16,(P)=>{
      let sleeve='#6b7fd7', pants='#3d4a7a', shoe='#4a2f1e';
      P(3,3,skin,6,5); P(2,4,skin,1,2); P(9,4,skin,1,2);
      if(race!=='consultant'){P(3,2,hair,6,2);P(2,3,hair,1,2);P(9,3,hair,1,2)}
      P(4,5,K);P(7,5,K);P(3,6,'#f19a9a');P(8,6,'#f19a9a');
      if(race==='operator'){
        P(3,1,'#d33a2c',6,2);P(2,3,'#d33a2c',8,1);P(9,3,'#a8231a',2,1);
        sleeve='#f2f2f2';pants='#2f5fc4';
        P(2,8,'#f2f2f2',8,1);P(2,9,'#2f5fc4',8,4);P(3,8,'#2f5fc4');P(8,8,'#2f5fc4');P(5,10,'#244c9e',2,2);
      } else if(race==='collaborator'){
        P(3,1,'#f4c430',6,2);P(5,0,'#f4c430',2,1);P(2,3,'#f4c430',8,1);P(8,1,'#fff3b0');
        sleeve='#7a8aa0';pants='#4a5a7a';
        P(2,8,'#f07d22',8,5);P(2,10,'#ffe9a8',8,1);P(5,8,'#7a8aa0',2,2);
      } else if(race==='consultant'){
        const robe='#6b3fa0', hat='#4a2a78';
        P(5,0,hat,2,1);P(4,1,hat,4,1);P(3,2,hat,6,1);P(1,3,hat,10,1);P(5,1,'#ffe066');
        P(2,4,'#ddd',1,2);P(9,4,'#ddd',1,2);
        sleeve=robe; P(2,8,robe,8,7);P(1,12,robe,10,3);
        P(3,7,'#eeeeee',6,2);P(4,9,'#eeeeee',4,1);P(5,10,'#eeeeee',2,1);
      } else if(race==='approver'){
        P(3,1,'#2f7d3b',6,2);P(2,3,'#2f7d3b',1,1);P(9,0,'#e0413a',1,3);
        sleeve='#3a9a4a';pants='#c9a66b';
        P(2,8,'#3a9a4a',8,5);P(2,11,'#6b4423',8,1);
      }
      P(1,8,sleeve,1,4);P(10,8,sleeve,1,4);P(1,12,skin);P(10,12,skin);
      if(race==='consultant'){
        if(frame===1)P(3,15,shoe,2,1);else if(frame===2)P(7,15,shoe,2,1);else{P(3,15,shoe,2,1);P(7,15,shoe,2,1)}
      } else {
        const L=(x,up)=>{if(up){P(x,13,pants,2,1);P(x,14,shoe,2,1)}else{P(x,13,pants,2,2);P(x,15,shoe,2,1)}};
        L(3,frame===1);L(7,frame===2);
      }
      if(race==='operator'){P(11,9,'#9aa3b5',1,4);P(10,9,'#9aa3b5')}
      if(race==='collaborator'){P(0,9,'#8b5a2b',1,4);P(0,8,'#e04f9b')}
      if(race==='consultant'){P(11,3,'#7fd3ff');P(11,4,'#8b5a2b',1,12)}
      if(race==='approver'){P(3,9,'#f5f0e1',6,3);P(3,9,'#d8cfb8',6,1);P(5,10,'#c0262d',2,1)}
      if(extra==='cup'){P(10,11,'#fff',2,2);P(10,11,'#7a4a2a',2,1)}
      if(extra==='paddle'){P(10,10,'#d33',2,2);P(10,12,'#6b4423',1,2)}
    }));
  }
  cache.set(key,s);return s;
}
const DESK=outlined(mk(22,14,(P)=>{P(1,0,'#2b2f3a',8,6);P(2,1,'#5fd3e8',6,4);P(3,2,'#b9f3ff',2,1);P(4,6,'#2b2f3a',2,1);P(0,7,'#b07a42',22,4);P(0,7,'#c99158',22,1);P(0,11,'#7a4f28',22,3);P(14,8,'#e9e1cf',4,2)}));
const COFFEE=outlined(mk(20,20,(P)=>{P(0,10,'#8a8f9c',20,10);P(0,10,'#a8adb9',20,2);P(2,0,'#3a3a44',9,10);P(3,2,'#d33',2,2);P(6,2,'#3c9',2,1);P(5,6,'#222',3,1);P(5,7,'#fff',3,3);P(13,6,'#fff',3,4);P(13,6,'#7a4a2a',3,1);P(16,2,'#3e8e4e',3,4);P(16,1,'#5fbf6f',3,2)}));
const TABLE=outlined(mk(30,16,(P)=>{P(0,0,'#2e8b57',30,12);P(0,0,'#3fae6e',30,1);P(14,0,'#f4f4f4',2,12);P(0,5,'#e6f2ea',30,1);P(1,12,'#444',2,4);P(27,12,'#444',2,4)}));
const PLANT=outlined(mk(10,14,(P)=>{P(2,9,'#b5643a',6,5);P(2,9,'#d07a4a',6,1);P(4,1,'#3e8e4e',2,8);P(1,3,'#3e8e4e',3,3);P(6,2,'#5fbf6f',3,4);P(3,0,'#5fbf6f',3,2)}));
const COOLER=outlined(mk(10,18,(P)=>{P(1,0,'#9fd6ff',8,7);P(2,1,'#d6efff',2,4);P(0,7,'#e8e8f0',10,11);P(3,10,'#4b8bd6',2,2);P(6,10,'#d33',2,2)}));

// ---------- furniture ----------
const tables={}, coffee={}, decor=[];
for(const key in ROOMS){
  const r=ROOMS[key];
  coffee[key]={x:r.x+r.w-26,y:r.y+r.h-26,busy:null};
  if(r.w>=120)tables[key]={x:r.x+Math.floor(r.w/2)-24,y:r.y+r.h-24,sides:[null,null]};
  // bottom-left: plant with the water cooler right beside it; coffee machine stays bottom-right
  decor.push({img:PLANT,x:r.x+5,y:r.y+r.h-20},{img:COOLER,x:r.x+18,y:r.y+r.h-24});
}
function deskSlots(key,n){
  const r=ROOMS[key], cols=Math.max(1,Math.floor((r.w-8)/30)), out=[];
  const used=Math.min(cols,Math.max(n,1)), x0=r.x+Math.floor((r.w-used*30)/2)+4;
  for(let i=0;i<n;i++){out.push({x:x0+(i%cols)*30,y:r.y+22+Math.floor(i/cols)*27})}
  return out;
}

// ---------- agents ----------
const agents=new Map();
let data=null;
function ageMs(a){return a.ask_ts?Date.now()-new Date(a.ask_ts).getTime():0}
function tier(a){const h=ageMs(a)/36e5;return h<24?0:h<168?1:2}
function ageText(a){const m=Math.max(0,ageMs(a))/6e4;if(m<60)return Math.round(m)+' min';const h=m/60;if(h<24)return Math.floor(h)+' h';const d=Math.floor(h/24);return d+' d'+(d<7?' '+Math.floor(h-d*24)+' h':'')}
function fmt(ts,withDate){if(!ts)return '–';const o={timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false};if(withDate){o.day='2-digit';o.month='2-digit'}return new Date(ts).toLocaleString(undefined,o).replace(',','')}

class Agent{
  constructor(d){this.id=d.id;this.v=hash(d.id);this.d=d;this.state='sit';this.timer=rnd(1,14);this.path=[];this.frame=0;this.ft=0;this.extra='';this.phase=Math.random()*6;this.box=null;this.hit=null}
  get room(){return ROOMS[this.d.room]||ROOMS.HQ}
  seat(){return {x:this.desk.x+15,y:this.desk.y+9}}
  front(){return {x:this.desk.x+15,y:this.desk.y+25}}
  goto(t,next){const p=[];if(Math.abs(t.x-this.x)>0.5)p.push({x:t.x,y:this.y});p.push({x:t.x,y:t.y});this.path=p;this.state='walk';this.next=next}
  release(){if(this.pong){this.pong.t.sides[this.pong.s]=null;this.pong=null}const c=coffee[this.d.room];if(c&&c.busy===this.id)c.busy=null}
  floorPoint(){const r=this.room;return {x:rnd(r.x+10,r.x+r.w-10),y:rnd(r.y+30,r.y+r.h-8)}}
  update(dt){
    this.ft+=dt;
    const toAlert=this.state==='walk'&&this.next==='alert';
    if(waiting(this.d)){
      if(this.state!=='alert'&&!toAlert){this.release();this.extra='';this.goto(this.front(),'alert')}
    } else if(this.state==='alert'||toAlert){this.goto(this.seat(),'sit')}
    if(this.state==='walk'){
      const t=this.path[0]; if(!t){this.arrive();return}
      const sp=(this.d.race==='observer'?11:15)*dt, dx=t.x-this.x, dy=t.y-this.y, dist=Math.hypot(dx,dy);
      if(dist<=sp){this.x=t.x;this.y=t.y;this.path.shift()}else{this.x+=dx/dist*sp;this.y+=dy/dist*sp}
      if(this.ft>0.18){this.ft=0;this.frame=this.frame===1?2:1}
    } else if(this.state!=='alert'){
      this.frame=0;this.timer-=dt;if(this.timer<=0)this.choose();
    } else this.frame=0;
  }
  arrive(){
    const n=this.next;
    if(n==='alert'){this.state='alert';return}
    if(n==='sit'){this.state='sit';this.timer=rnd(10,35);return}
    if(n==='coffee'){this.state='coffee';this.timer=rnd(3,6);return}
    if(n==='pong'){this.state='pong';this.extra='paddle';this.timer=rnd(8,16);return}
    this.state='idle';this.timer=rnd(2,5);
  }
  choose(){
    if(this.state==='coffee'){this.release();this.extra='cup';this.goto(this.seat(),'sit');return}
    if(this.state==='pong'||this.state==='idle'){this.release();if(this.state==='pong')this.extra='';this.goto(this.seat(),'sit');return}
    this.extra='';
    const r=Math.random(), c=coffee[this.d.room], t=tables[this.d.room];
    if(r<0.3&&c&&!c.busy){c.busy=this.id;this.goto({x:c.x+8,y:c.y+25},'coffee');return}
    if(r<0.6&&t){const s=t.sides[0]===null?0:t.sides[1]===null?1:-1;if(s>=0){t.sides[s]=this.id;this.pong={t,s};this.goto(s===0?{x:t.x-6,y:t.y+11}:{x:t.x+38,y:t.y+11},'pong');return}}
    if(r<0.85){this.goto(this.floorPoint(),'idle');return}
    this.timer=rnd(8,20);
  }
}

function applyData(d){
  if(!d||!Array.isArray(d.agents))throw new Error('bad status.json');
  data=d;
  // prune local marks that no longer apply (answered upstream, new ask, refresh arrived, snooze over)
  for(const id of Object.keys(local)){const a=d.agents.find(x=>x&&x.id===id);if(!a||!markOf(a))delete local[id]}
  saveLocal();
  const seen=new Set(), byRoom={};
  for(const a of d.agents){if(!a||!a.id)continue;const room=a.room in ROOMS?a.room:'HQ';(byRoom[room]=byRoom[room]||[]).push(a)}
  for(const room in byRoom){
    const list=byRoom[room].sort((a,b)=>a.name.localeCompare(b.name));
    const slots=deskSlots(room,list.length);
    list.forEach((a,i)=>{
      a.room=room; seen.add(a.id);
      let ag=agents.get(a.id);
      if(!ag){
        ag=new Agent(a);agents.set(a.id,ag);ag.desk=slots[i];
        const p=waiting(a)?ag.front():ag.seat();ag.x=p.x;ag.y=p.y;if(waiting(a))ag.state='alert';
      } else {
        const moved=ag.desk.x!==slots[i].x||ag.desk.y!==slots[i].y;ag.desk=slots[i];ag.d=a;
        if(moved&&ag.state==='sit'){const s=ag.seat();ag.x=s.x;ag.y=s.y}
      }
      ag.d=a;
    });
  }
  for(const id of [...agents.keys()])if(!seen.has(id)){agents.get(id).release();agents.delete(id)}
  renderBar();
}

// ---------- rendering ----------
const cv=document.getElementById('c'), ctx=cv.getContext('2d');
let S=1, DPR=1;
function resize(){
  const st=document.getElementById('stage'), w=st.clientWidth, h=st.clientHeight;
  S=Math.max(0.5,Math.min(w/W,h/H)); DPR=window.devicePixelRatio||1;
  cv.style.width=Math.floor(W*S)+'px'; cv.style.height=Math.floor(H*S)+'px';
  cv.width=Math.floor(W*S*DPR); cv.height=Math.floor(H*S*DPR);
}
window.addEventListener('resize',resize);
document.addEventListener('fullscreenchange',()=>setTimeout(resize,50));
function shade(hex,amt){const n=parseInt(hex.slice(1),16);return '#'+[n>>16,(n>>8)&255,n&255].map(v=>Math.max(0,Math.min(255,v+amt)).toString(16).padStart(2,'0')).join('')}
const floorCache={};
function drawRoom(key){
  const r=ROOMS[key];
  if(!floorCache[key])floorCache[key]=mk(r.w,r.h,(P)=>{
    for(let y=16;y<r.h;y+=8)for(let x=0;x<r.w;x+=8)P(x,y,((x+y)/8)%2?r.floor:shade(r.floor,-12),8,8);
    P(0,0,r.wall,r.w,16);P(0,13,shade(r.wall,-25),r.w,3);
    for(let x=6;x+12<r.w;x+=22){P(x,3,shade(r.wall,25),12,8);P(x+1,4,'#9fd8ff',10,6);P(x+1,4,'#d4f0ff',3,2)}
    P(0,0,K,r.w,1);P(0,0,K,2,r.h);P(r.w-2,0,K,2,r.h);P(0,r.h-2,K,r.w,2);
    P(Math.floor(r.w/2)-10,key in{WORK:1,PROJ_A:1,PROJ_B:1,RESEARCH:1}?r.h-2:0,shade(r.floor,-30),20,2);
  });
  ctx.drawImage(floorCache[key],r.x,r.y);
}
function sign(key){
  const r=ROOMS[key];
  ctx.font='bold 7px ui-monospace,Menlo,Consolas,monospace';
  const tw=Math.ceil(ctx.measureText(r.label).width)+8, x=Math.round(r.x+r.w/2-tw/2), y=r.y+2;
  ctx.fillStyle=K;ctx.fillRect(x-1,y-1,tw+2,12);ctx.fillStyle='#6b4423';ctx.fillRect(x,y,tw,10);ctx.fillStyle='#8a5a30';ctx.fillRect(x,y,tw,1);
  ctx.fillStyle='#ffd166';ctx.textBaseline='middle';ctx.textAlign='center';ctx.fillText(r.label,r.x+r.w/2,y+5.5);
}
function drawHall(){
  ctx.fillStyle='#7a6553';ctx.fillRect(0,136,W,16);
  ctx.fillStyle='#6a5646';for(let x=0;x<W;x+=16)ctx.fillRect(x,136,1,16);
  ctx.fillStyle='#8c7562';ctx.fillRect(0,143,W,1);
}
function bubble(a,t){
  const tr=tier(a.d), bob=Math.round(Math.sin(t*2+a.phase)*1.2), shake=tr===2?Math.round(Math.sin(t*25)*0.8):0;
  const top=Math.round(a.y)-(a.d.race==='observer'?19:18)-14+bob, cx=Math.round(a.x)+shake;
  const w=tr===2?30:13, h=12, x=cx-Math.floor(w/2), y=top;
  ctx.fillStyle=K;ctx.fillRect(x-1,y,w+2,h);ctx.fillRect(x,y-1,w,h+2);
  ctx.fillStyle='#fffbe8';ctx.fillRect(x,y,w,h);
  ctx.fillStyle=K;ctx.fillRect(cx-1,y+h+1,3,1);ctx.fillRect(cx,y+h+2,1,1);ctx.fillStyle='#fffbe8';ctx.fillRect(cx-1,y+h,3,1);
  if(tr===0){ctx.fillStyle='#d8343c';ctx.fillRect(cx-1,y+2,2,6);ctx.fillRect(cx-1,y+9,2,2)}
  else if(tr===1){
    const fx=cx-4,fy=y+2;ctx.fillStyle='#e8453c';ctx.fillRect(fx+1,fy,7,9);ctx.fillRect(fx,fy+1,9,7);
    ctx.fillStyle=K;ctx.fillRect(fx+1,fy+2,2,1);ctx.fillRect(fx+3,fy+3,1,1);ctx.fillRect(fx+6,fy+2,2,1);ctx.fillRect(fx+5,fy+3,1,1);
    ctx.fillRect(fx+2,fy+4,1,1);ctx.fillRect(fx+6,fy+4,1,1);ctx.fillRect(fx+3,fy+6,3,1);ctx.fillRect(fx+2,fy+7,1,1);ctx.fillRect(fx+6,fy+7,1,1);
  } else {ctx.font='bold 8px ui-monospace,Menlo,Consolas,monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#c0262d';ctx.fillText('#@$%!',cx,y+6.5)}
  a.hit={x:x-2,y:y-2,w:w+4,h:h+6};
}
// Name tags: stagger downward when two tags would overlap (e.g. adjacent alerts in one room).
function nameTags(list){
  ctx.font='bold 5px ui-monospace,Menlo,Consolas,monospace';ctx.textAlign='center';ctx.textBaseline='top';
  const placed=[];
  for(const a of [...list].sort((p,q)=>p.x-q.x)){
    const n=a.d.name.length>14?a.d.name.slice(0,13)+'…':a.d.name, w=Math.ceil(ctx.measureText(n).width)+4;
    const r={x:Math.round(a.x-w/2),y:Math.round(a.y)+1,w,h:7};
    for(let i=0;i<4&&placed.some(o=>r.x<o.x+o.w&&o.x<r.x+r.w&&r.y<o.y+o.h&&o.y<r.y+r.h);i++)r.y+=8;
    placed.push(r);
    ctx.fillStyle='rgba(27,20,38,.85)';ctx.fillRect(r.x,r.y,w,7);ctx.fillStyle='#fffbe8';ctx.fillText(n,Math.round(a.x),r.y+1);
  }
}
// ---------- per-room alert board (top-right of the wall band) ----------
// Light colour by number of agents in the room that need you: < yellow -> green, < red -> yellow, >= red -> red.
const BOARD_THRESHOLDS={yellow:1, red:3};
const LIGHT={green:['#3fd46a','#1f7a3a'], yellow:['#ffd23f','#a8820f'], red:['#ff4040','#8a1414']};
function roomLevel(n){return n>=BOARD_THRESHOLDS.red?'red':n>=BOARD_THRESHOLDS.yellow?'yellow':'green'}
function board(key,t){
  const r=ROOMS[key], n=(data&&data.agents||[]).filter(a=>waiting(a)&&a.room===key).length, lvl=roomLevel(n);
  const label=String(n), bw=label.length>1?20:16, bh=11, x=r.x+r.w-bw-3, y=r.y+2;
  ctx.fillStyle=K;ctx.fillRect(x-1,y-1,bw+2,bh+2);
  ctx.fillStyle='#6b4423';ctx.fillRect(x,y,bw,bh);ctx.fillStyle='#8a5a30';ctx.fillRect(x,y,bw,1);
  ctx.fillStyle='#14101c';ctx.fillRect(x+2,y+2,bw-4,bh-4);
  const [on,off]=LIGHT[lvl], blink=lvl==='red'&&Math.sin(t*4)<-0.2;
  const lx=x+3, ly=y+3;
  ctx.fillStyle=blink?off:on;ctx.fillRect(lx+1,ly,3,5);ctx.fillRect(lx,ly+1,5,3);
  if(!blink){ctx.fillStyle='rgba(255,255,255,.7)';ctx.fillRect(lx+1,ly+1,1,1)}
  ctx.font='bold 7px ui-monospace,Menlo,Consolas,monospace';ctx.textAlign='left';ctx.textBaseline='middle';
  ctx.fillStyle=lvl==='green'?'#bff5d4':'#ffd166';ctx.fillText(label,lx+7,y+bh/2+0.5);
}
function markIcon(a,m,t){
  const x=Math.round(a.x)+7, y=a.box.y+2+Math.round(Math.sin(t*2+a.phase));
  if(m.kind==='sent'){ // envelope with a green check
    ctx.fillStyle=K;ctx.fillRect(x-1,y-1,10,8);ctx.fillStyle='#fffbe8';ctx.fillRect(x,y,8,6);
    ctx.fillStyle='#b8a98a';ctx.fillRect(x+1,y+1,1,1);ctx.fillRect(x+2,y+2,1,1);ctx.fillRect(x+3,y+3,2,1);ctx.fillRect(x+5,y+2,1,1);ctx.fillRect(x+6,y+1,1,1);
    ctx.fillStyle='#2fae6a';ctx.fillRect(x+6,y+4,1,1);ctx.fillRect(x+7,y+5,1,1);ctx.fillRect(x+8,y+4,1,1);ctx.fillRect(x+9,y+3,1,1);ctx.fillRect(x+10,y+2,1,1);
  } else {ctx.font='bold 6px ui-monospace,Menlo,Consolas,monospace';ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle=K;ctx.fillText('zZ',x+1,y+1);ctx.fillStyle='#9fd8ff';ctx.fillText('zZ',x,y)}
}
let last=performance.now();
function frame(now){
  try{
    const dt=Math.min(0.1,(now-last)/1000), t=now/1000; last=now;
    for(const a of agents.values())a.update(dt);
    ctx.setTransform(S*DPR,0,0,S*DPR,0,0);ctx.imageSmoothingEnabled=false;
    ctx.fillStyle='#120d1b';ctx.fillRect(0,0,W,H);
    drawHall();
    for(const k in ROOMS)drawRoom(k);
    const items=[];
    for(const k in coffee){const c=coffee[k];items.push({y:c.y+20,draw:()=>ctx.drawImage(COFFEE,c.x,c.y)})}
    for(const k in tables){const tb=tables[k];items.push({y:tb.y+14,draw:()=>{
      ctx.drawImage(TABLE,tb.x,tb.y);
      const A=agents.get(tb.sides[0]),B=agents.get(tb.sides[1]);
      if(A&&B&&A.state==='pong'&&B.state==='pong'){const p=(t*0.9)%2,u=p<1?p:2-p;ctx.fillStyle='#fff';ctx.fillRect(Math.round(tb.x+2+u*26),Math.round(tb.y+4-Math.sin(u*Math.PI)*4),2,2)}
    }})}
    for(const d of decor)items.push({y:d.y+d.img.height,draw:()=>ctx.drawImage(d.img,d.x,d.y)});
    for(const a of agents.values()){
      items.push({y:a.desk.y+13,draw:()=>ctx.drawImage(DESK,a.desk.x,a.desk.y)});
      items.push({y:a.y,draw:()=>{
        const obs=a.d.race==='observer';
        const f=obs?(Math.sin(t*0.7+a.phase*7)>0.985?3:0):a.frame;
        const img=sprite(a.d.race,a.v,f,obs?'':a.extra);
        const bob=obs?Math.round(Math.sin(t*2+a.phase)*1.5)-3:(a.state==='sit'&&Math.sin(t*3+a.phase)>0.6?-1:0);
        if(obs){ctx.fillStyle='rgba(0,0,0,.25)';ctx.fillRect(Math.round(a.x)-4,Math.round(a.y)-1,8,2)}
        const x=Math.round(a.x-img.width/2), y=Math.round(a.y-img.height)+bob;
        ctx.drawImage(img,x,y);
        a.box={x:x-2,y:y-2,w:img.width+4,h:img.height+4};
      }});
    }
    items.sort((p,q)=>p.y-q.y).forEach(i=>i.draw());
    for(const k in ROOMS){sign(k);board(k,t)}
    const alerts=[...agents.values()].filter(a=>waiting(a.d)&&a.state==='alert');
    for(const a of agents.values())a.hit=null;
    nameTags(alerts);
    alerts.forEach(a=>bubble(a,t));
    for(const a of agents.values()){const m=markOf(a.d);if(m&&a.box&&(m.kind!=='sent'||Date.now()-m.at<ENVELOPE_MS))markIcon(a,m,t)}
  }catch(e){console.error(e)}
  requestAnimationFrame(frame);
}

// ---------- UI ----------
const $=id=>document.getElementById(id);
function needsList(){return (data&&data.agents||[]).filter(waiting).sort((a,b)=>new Date(a.ask_ts||0)-new Date(b.ask_ts||0))}
function renderBar(){
  const n=needsList().length;$('needs').textContent='Needs you: '+n;$('needs').classList.toggle('hot',n>0);
  const stale=data&&data.updated_at&&Date.now()-new Date(data.updated_at).getTime()>3*36e5;
  $('updated').textContent='updated '+fmt(data&&data.updated_at)+(stale?' (stale)':'');$('updated').classList.toggle('stale',!!stale);
}
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const badge=a=>['!','>:(','#@$%!'][tier(a)];
function toast(msg,ok){
  let el=document.getElementById('toast');
  if(!el){el=document.createElement('div');el.id='toast';document.body.appendChild(el)}
  el.textContent=msg;el.className=ok?'ok on':'bad on';clearTimeout(toast._t);toast._t=setTimeout(()=>{el.className=el.className.replace(' on','')},2600);
}
let sending=false;
async function sendReply(a,text,snooze){
  text=(text||'').trim(); if(!text||sending)return;
  sending=true; document.querySelectorAll('#modalBody .qb').forEach(b=>b.disabled=true);
  const payload={agent_id:a.id,agent_name:a.name,kind:snooze?'snooze':'reply',reply:text,question:a.question||null,sent_at:new Date().toISOString()};
  let ok=false;
  try{
    const ctl=new AbortController(), timer=setTimeout(()=>ctl.abort(),15000);
    const res=await fetch(REPLY_PATH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store',signal:ctl.signal});
    clearTimeout(timer); ok=res.ok;
  }catch(e){ok=false}
  sending=false;
  if(ok){
    local[a.id]={kind:snooze?'snooze':'sent',at:Date.now(),ask_ts:a.ask_ts,until:snooze?Date.now()+SNOOZE_MS:undefined};saveLocal();
    const ag=agents.get(a.id);if(ag){ag.release();ag.goto(ag.seat(),'sit')}
    renderBar();closeAll();toast(snooze?'Snoozed ✓':'Sent ✓',true);
  } else {
    document.querySelectorAll('#modalBody .qb').forEach(b=>b.disabled=false);
    toast('Failed, try Grok Bot',false);
  }
}
function openAgent(id){
  const a=data.agents.find(x=>x.id===id);if(!a)return;
  const room=(ROOMS[a.room]||{}).label||a.room, race=RACE[a.race]||{label:a.race,look:''};
  const link='grokbot://app/v1/agent?id='+encodeURIComponent(a.id), m=markOf(a), qr=a.quick_replies||[];
  let h='<h2>'+esc(a.name)+'</h2>'+
   '<div class="row"><span class="k">Area</span>'+esc(room)+' <span class="muted">· '+esc(race.label)+' ('+esc(race.look)+')</span></div>';
  if(a.needs_you){
    h+='<div class="row"><span class="k">Why</span>'+esc(a.reason)+'</div>'+
     '<div class="row"><span class="k">Signal</span>'+esc(String(a.signal||'').split('+').map(s=>SIGNAL[s]||s).join(' + '))+'</div>'+
     '<div class="row"><span class="k">Waiting</span><b class="t'+tier(a)+'">'+esc(ageText(a))+'</b> <span class="muted">since '+esc(fmt(a.ask_ts,true))+'</span></div>';
    if(m)h+='<div class="note">'+(m.kind==='snooze'?'Snoozed on this device until '+esc(fmt(new Date(m.until).toISOString(),true))+'':'Reply sent '+esc(fmt(new Date(m.at).toISOString(),true))+' · waiting for the next status refresh')+'</div>';
    if(a.question)h+='<div class="q">'+esc(a.question)+'</div>';
    if(qr.length)h+='<div class="qr">'+qr.map((b,i)=>'<button type="button" class="qb'+(b.snooze?' snz':'')+'" data-qr="'+i+'" title="'+esc(b.reply)+'">'+esc(b.label)+'</button>').join('')+'</div>';
    if(a.fallback==='grokbot')h+='<div class="muted">'+(qr.length?'Not covered by a button? Solve it in Grok Bot.':'No quick answer fits this one. Best solved in Grok Bot.')+'</div>';
    h+='<details class="typed"><summary>Type a reply</summary><textarea id="typedText" rows="3" placeholder="Your reply to '+esc(a.name)+'"></textarea><button type="button" class="qb" data-typed>Send</button></details>';
  } else h+='<div class="row"><span class="k">Status</span>All good, nothing waiting on you.</div>';
  h+='<div class="row gbrow"><a class="gb" href="'+esc(link)+'">Open in Grok Bot</a><span class="tag">unverified link</span></div>'+
   '<button class="close" type="button" data-close>Close</button>';
  $('modalBody').innerHTML=h;
  $('modalBody').querySelectorAll('[data-qr]').forEach(el=>el.addEventListener('click',()=>{const b=qr[+el.dataset.qr];sendReply(a,b.reply,!!b.snooze)}));
  const tb=$('modalBody').querySelector('[data-typed]');if(tb)tb.addEventListener('click',()=>sendReply(a,$('typedText').value,false));
  $('list').classList.remove('on');$('modal').classList.add('on');
}
function openList(){
  const L=needsList();
  $('listBody').innerHTML='<h2>Needs you ('+L.length+') · oldest first</h2>'+
   (L.length?L.map(a=>'<div class="li" data-id="'+esc(a.id)+'"><span class="b t'+tier(a)+'">'+esc(badge(a))+'</span><div><div class="n">'+esc(a.name)+' <span class="muted">· '+esc((ROOMS[a.room]||{}).label||a.room)+' · '+esc(ageText(a))+'</span></div><div class="s">'+esc(a.reason)+'</div></div></div>').join(''):'<p>Nobody is waiting on you.</p>')+
   '<p class="muted">Status '+esc(fmt(data&&data.updated_at,true))+' · card snapshot '+esc(fmt(data&&data.cards_cached_at,true))+'</p><button class="close" type="button" data-close>Close</button>';
  $('listBody').querySelectorAll('.li').forEach(el=>el.addEventListener('click',()=>openAgent(el.dataset.id)));
  $('list').classList.add('on');
}
function closeAll(){$('modal').classList.remove('on');$('list').classList.remove('on')}
for(const id of['modal','list'])$(id).addEventListener('click',e=>{if(e.target.id===id||e.target.hasAttribute('data-close'))closeAll()});
$('needs').addEventListener('click',openList);
$('fs').addEventListener('click',()=>{const d=document.documentElement;if(document.fullscreenElement){document.exitFullscreen&&document.exitFullscreen()}else{const f=d.requestFullscreen||d.webkitRequestFullscreen;f&&f.call(d)}});
cv.addEventListener('pointerdown',e=>{
  const r=cv.getBoundingClientRect(), x=(e.clientX-r.left)/S, y=(e.clientY-r.top)/S;
  const inn=b=>b&&x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h;
  const list=[...agents.values()].sort((a,b)=>(waiting(b.d)-waiting(a.d))||(b.y-a.y));
  const hit=list.find(a=>inn(a.hit))||list.find(a=>inn(a.box));
  if(hit)openAgent(hit.id);
});

// ---------- data ----------
async function load(){
  try{
    const res=await fetch('status.json?t='+Date.now(),{cache:'no-store'});
    if(!res.ok)throw new Error('HTTP '+res.status);
    applyData(await res.json());
  }catch(err){
    console.warn('GrokPod: status.json fetch failed',String(err));
    $('updated').textContent=(data?'updated '+fmt(data.updated_at)+' · ':'')+'offline';$('updated').classList.add('stale');
  }
}
resize();load();setInterval(load,3*60*1000);setInterval(()=>{if(data)renderBar()},60*1000);
requestAnimationFrame(frame);
