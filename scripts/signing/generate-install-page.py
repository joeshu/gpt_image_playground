#!/usr/bin/env python3
import json, html, pathlib, datetime
root=pathlib.Path('build/signed'); docs=pathlib.Path('docs/install'); docs.mkdir(parents=True,exist_ok=True)
items=[]
for meta in sorted(root.glob('*/metadata.json')):
    try: d=json.loads(meta.read_text()); items.append(d)
    except Exception: pass
cards=''.join(f'''<article class="card"><h2>{html.escape(x['name'])}</h2><p>{html.escape(x.get('expires','Unknown'))}</p><a href="itms-services://?action=download-manifest&url={html.escape(x['manifest_url'], quote=True)}">安装</a></article>''' for x in items)
page=f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GPT Image Playground iOS 安装</title><style>body{{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:900px;margin:auto;padding:24px;background:#f5f5f7}}.card{{background:white;border-radius:18px;padding:20px;margin:14px 0;box-shadow:0 4px 20px #0001}}a{{display:inline-block;padding:12px 20px;border-radius:12px;background:#111;color:#fff;text-decoration:none}}</style><h1>GPT Image Playground</h1><p>选择一个当前可用的签名。公开企业证书可能随时被撤销；失败时换另一个。</p>{cards}<footer>Generated {datetime.datetime.now(datetime.timezone.utc).isoformat()} · {len(items)} signatures</footer></html>'''
(docs/'index.html').write_text(page)
