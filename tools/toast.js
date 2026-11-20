// Smoke test for quick replies: intercepts POST /api/reply (nothing leaves the machine), checks the ok/fail toasts,
// snooze and the typed-reply path. Run against ./demo.sh (uses the demo agent ids from examples/).
const puppeteer=require('puppeteer-core');
const URL=process.env.GP_URL||'http://127.0.0.1:8766/', OUT=process.env.GP_OUT||'.';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox']});
const p=await b.newPage();await p.setViewport({width:1280,height:800});const errs=[],posts=[];
p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.setRequestInterception(true);let mode='ok';
p.on('request',r=>{if(r.url().includes('/api/reply')){posts.push({method:r.method(),ct:r.headers()['content-type'],auth:!!r.headers()['authorization'],body:JSON.parse(r.postData())});r.respond({status:mode==='ok'?200:502,contentType:'application/json',body:'{}'})}else r.continue()});
await p.goto(URL,{waitUntil:'networkidle0'});await wait(2000);
await p.evaluate(()=>openAgent('demo-0003'));await wait(400);
await p.screenshot({path:OUT+'/test_modal_qr.png'});
await p.click('[data-qr="0"]');await wait(500);
await p.screenshot({path:OUT+'/test_toast_ok.png'});
mode='fail';await wait(2500);
await p.evaluate(()=>openAgent('demo-0009'));await wait(300);
await p.click('.qb.snz');await wait(500);
await p.screenshot({path:OUT+'/test_toast_fail.png'});
mode='ok';await p.click('.qb.snz');await wait(600);
await p.evaluate(()=>openAgent('demo-0005'));await p.click('details.typed summary');await p.type('#typedText','Yes, block it.');await p.click('[data-typed]');await wait(600);
const st=await p.evaluate(()=>({needs:document.getElementById('needs').textContent,marks:Object.fromEntries(Object.entries(JSON.parse(localStorage.getItem('grokpod.local.v1')||'{}')).map(([k,v])=>[k,v.kind]))}));
await wait(3000);await p.screenshot({path:OUT+'/test_marked.png'});
console.log(JSON.stringify({posts,st,errs},null,1));await b.close()})();
