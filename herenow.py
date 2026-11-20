#!/usr/bin/env python3
"""Minimal here.now deploy client for GrokPod. Never prints the API key.
usage: herenow.py deploy   -> create (first run) or update the site from ./site
       herenow.py private  -> set owner-only access ("Only you")
env:   HERENOW_API_KEY (required), GROKPOD_WEBHOOK_URL (router webhook; rendered into site/.herenow/proxy.json),
       GP_SITE_DIR, GP_STATE (optional overrides). site.json (slug/URL of your site) is created on first deploy and git-ignored."""
import hashlib, json, os, sys, urllib.request, mimetypes
D = os.path.dirname(os.path.abspath(__file__))
SITE_DIR, STATE = os.environ.get('GP_SITE_DIR', f'{D}/site'), os.environ.get('GP_STATE', f'{D}/site.json')
BASE = 'https://here.now'
KEY = os.environ.get('HERENOW_API_KEY')
if not KEY: sys.exit('HERENOW_API_KEY not set')
HDR = {'X-HereNow-Client': 'grokbot/direct-api', 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
CT = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8'}

def call(method, url, body=None, headers=None, raw=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url if url.startswith('http') else BASE + url, data=data, method=method, headers=headers or HDR)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            t = r.read(); return json.loads(t) if t and r.headers.get_content_type() == 'application/json' else t
    except urllib.error.HTTPError as e:
        sys.exit(f'{method} {url} -> HTTP {e.code}: {e.read()[:400].decode(errors="replace")}')

def manifest():
    files = []
    for root, dirs, names in os.walk(SITE_DIR):
        dirs.sort()
        for name in sorted(names):
            if name.endswith('.example.json'): continue
            p = os.path.join(root, name); rel = os.path.relpath(p, SITE_DIR).replace(os.sep, '/')
            b = open(p, 'rb').read()
            files.append(dict(path=rel, size=len(b), contentType=CT.get(os.path.splitext(name)[1], mimetypes.guess_type(name)[0] or 'application/octet-stream'), hash=hashlib.sha256(b).hexdigest()))
    return files

def render_proxy():
    """site/.herenow/proxy.json is git-ignored: build it from the committed example + GROKPOD_WEBHOOK_URL.
    ${GROKPOD_WEBHOOK_KEY} is left as-is so the key is filled in server-side, never stored in the repo."""
    src = os.path.join(SITE_DIR, '.herenow', 'proxy.example.json')
    url = os.environ.get('GROKPOD_WEBHOOK_URL')
    if not (os.path.exists(src) and url): return
    open(os.path.join(SITE_DIR, '.herenow', 'proxy.json'), 'w').write(open(src).read().replace('${GROKPOD_WEBHOOK_URL}', url))

def deploy():
    render_proxy()
    st = json.load(open(STATE)) if os.path.exists(STATE) else {}
    files = manifest()
    body = {'files': files}
    if st.get('slug'):
        r = call('PUT', f"/api/v1/publish/{st['slug']}", body)
    else:
        body['displayName'] = 'GrokPod'
        r = call('POST', '/api/v1/publish', body)
    slug = r.get('slug') or st.get('slug')
    st.update(slug=slug, siteUrl=r.get('siteUrl') or st.get('siteUrl')); json.dump(st, open(STATE, 'w'), indent=1)
    u0 = r.get('upload') or r
    up = []
    for u in u0.get('uploads', []):
        h = dict(u.get('headers') or {})
        call(u.get('method', 'PUT'), u['url'], raw=open(f"{SITE_DIR}/{u['path']}", 'rb').read(), headers=h)
        up.append(u['path'])
    f = call('POST', u0.get('finalizeUrl') or f'/api/v1/publish/{slug}/finalize', {'versionId': u0['versionId']})
    st.update(slug=slug, siteUrl=f.get('siteUrl') or st.get('siteUrl') or f'https://{slug}.here.now/', lastVersion=u0['versionId'])
    json.dump(st, open(STATE, 'w'), indent=1)
    print(json.dumps(dict(slug=slug, siteUrl=st['siteUrl'], uploaded=up, skipped=[s if isinstance(s, str) else s.get('path') for s in u0.get('skipped', [])], warnings=f.get('warnings'))))
    if f.get('warnings'): sys.exit('finalize warnings: check .herenow manifests')

def private():
    st = json.load(open(STATE))
    r = call('PATCH', f"/api/v1/publish/{st['slug']}/access", {'mode': 'restricted', 'allowedEmails': [], 'allowedDomains': []})
    print(json.dumps(r)[:400])

if __name__ == '__main__':
    {'deploy': deploy, 'private': private}[sys.argv[1]]()
