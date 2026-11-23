"""把本机 dsh-whale-widget 的资产与状态复制进 App 的 public/whale/（折中方案 A 用）。

产物：
  public/whale/whale-widget.js
  public/whale/roles/<id>.png     内置角色图
  public/whale/bubbles/<id>.png   用户气泡图库（跳过超大文件）
  public/whale/audio/*            预设 + 用户音效
  public/whale/rua.gif
  public/whale/seed/bubble.json   .dshw-bubble.json 原样
  public/whale/seed/size.json     .dshw-size.json 原样
  public/whale/index.json         资源清单（install.ts 用来做 URL 映射）
"""
import json
import os
import pathlib
import shutil

HOME = pathlib.Path(os.path.expanduser('~'))
PKG = HOME / '.dsh/profiles/web/node_modules/dsh-whale-widget'
APP = pathlib.Path(__file__).resolve().parent.parent  # projects/dsh-app
OUT = APP / 'public' / 'whale'
MAX_BUBBLE_BYTES = 900_000

shutil.rmtree(OUT, ignore_errors=True)
for sub in ('roles', 'bubbles', 'audio', 'seed'):
    (OUT / sub).mkdir(parents=True, exist_ok=True)

manifest: dict = {'roles': {}, 'defaultRole': 'default', 'bubbles': {}, 'audio': {}, 'static': {}}

shutil.copy2(PKG / 'assets/whale-widget.js', OUT / 'whale-widget.js')

builtin = {'default': 'DSniang1.png', 'dsh2': 'DSH2.png', 'dsniang2': 'DSniang02.png'}
for role_id, filename in builtin.items():
    src = PKG / 'assets' / filename
    if src.exists():
        dest = OUT / 'roles' / f'{role_id}{src.suffix.lower()}'
        shutil.copy2(src, dest)
        manifest['roles'][role_id] = f'roles/{dest.name}'

if (PKG / 'assets/rua.gif').exists():
    shutil.copy2(PKG / 'assets/rua.gif', OUT / 'rua.gif')
    manifest['static']['rua'] = 'rua.gif'

for f in sorted((HOME / '.dsh/whale-bubble-imgs').glob('bimg_*')):
    if f.stat().st_size > MAX_BUBBLE_BYTES:
        print('跳过超大气泡图', f.name, round(f.stat().st_size / 1024 / 1024, 1), 'MB')
        continue
    shutil.copy2(f, OUT / 'bubbles' / f.name)
    manifest['bubbles'][f.stem] = f'bubbles/{f.name}'

for name in ['D1.mp3', 'D2.mp3', 'Ya1.mp3', 'Ya2.mp3', 'task-end-a.wav', 'minecraft-exp-orb.wav']:
    src = PKG / 'assets' / name
    if src.exists():
        shutil.copy2(src, OUT / 'audio' / name)
        manifest['static'][pathlib.Path(name).stem] = f'audio/{name}'

audio_dir = HOME / '.dsh/whale-audio'
if audio_dir.is_dir():
    for f in audio_dir.glob('*.wav'):
        shutil.copy2(f, OUT / 'audio' / f.name)
        manifest['audio'][f.stem] = f'audio/{f.name}'

for name, src in [('bubble', HOME / '.dsh/.dshw-bubble.json'), ('size', HOME / '.dsh/.dshw-size.json')]:
    if src.exists():
        data = json.loads(src.read_text(encoding='utf-8'))
        (OUT / 'seed' / f'{name}.json').write_text(
            json.dumps(data, ensure_ascii=False), encoding='utf-8')
        manifest.setdefault('seed', {})[name] = f'seed/{name}.json'

(OUT / 'index.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding='utf-8')
total = sum(f.stat().st_size for f in OUT.rglob('*') if f.is_file())
print('复制完成：', len(manifest['roles']), '角色,', len(manifest['bubbles']), '气泡图,',
      round(total / 1024 / 1024, 1), 'MB ->', OUT)
