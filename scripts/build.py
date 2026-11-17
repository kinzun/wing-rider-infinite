"""Build an offline HTML from the explicit browser dependency order."""
from pathlib import Path
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(ROOT / 'scripts/build-six.py')], check=True)
manifest = json.loads((ROOT / 'scripts/browser-scripts.json').read_text())
html = (ROOT / 'src/ui/template.html').read_text()
html = html.replace('/* INLINE_STYLES */', (ROOT / 'src/ui/styles.css').read_text())
scripts = '\n'.join('<script>\n' + (ROOT / name).read_text() + '\n</script>' for name in manifest)
(ROOT / 'index.html').write_text(html.replace('</body>', scripts + '\n</body>'))
print('Built offline index.html')
