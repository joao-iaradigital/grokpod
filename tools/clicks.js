// Smoke test: open the "Needs you" list, then the first agent in it. Run against ./demo.sh.
const puppeteer=require('puppeteer-core');
const URL=process.env.GP_URL||'http://127.0.0.1:8766/', OUT=process.env.GP_OUT||'.';
(async()=>{const b=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox']});
const p=await b.newPage();await p.setViewport({width:1280,height:800});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto(URL,{waitUntil:'networkidle0'});await new Promise(r=>setTimeout(r,2000));
await p.click('#needs');await new Promise(r=>setTimeout(r,500));await p.screenshot({path:OUT+'/test_list.png'});
await p.click('#listBody .li');await new Promise(r=>setTimeout(r,500));await p.screenshot({path:OUT+'/test_modal.png'});
console.log(JSON.stringify({errs}));await b.close()})();
