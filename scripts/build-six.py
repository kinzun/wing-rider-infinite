"""Bundle the copied ES modules, with the game's bounded-pool and render adaptations."""
from pathlib import Path
import json
import posixpath
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'vendor/reference-six'
OUTPUT = ROOT / 'build/six-bundle.js'
OUTPUT.parent.mkdir(exist_ok=True)
parts = []

for file in sorted(SOURCE.rglob('*.js')):
    name = file.relative_to(SOURCE).as_posix()
    source = file.read_text()

    def convert_import(match):
        names, specifier = match.group(1), match.group(2)
        target = specifier if specifier == 'three' else posixpath.normpath(
            posixpath.join(posixpath.dirname(name), specifier)
        )
        bindings = re.sub(r'\bas\b', ':', names)
        return 'const ' + bindings + '=require(' + json.dumps(target) + ');'

    source = re.sub(
        r'import\s+(\{[\s\S]*?\})\s+from\s+[\'"]([^\'"]+)[\'"];',
        convert_import,
        source,
    )
    exports = re.findall(r'export\s+(?:class|const|function|let)\s+(\w+)', source)
    source = re.sub(r'\bexport\s+', '', source)
    if name == 'core/Layers.js':
        source = source.replace('VFX: 1', 'VFX: 0')
    if name == 'shaders/lib/common.glsl.js':
        source = re.sub(
            r'  float packed = unpackRGBAToDepth[\s\S]*?return clamp\([^;]+;',
            '  return 1.0;', source, count=1,
        )
    if name == 'particles/ParticleEngine.js':
        source = source.replace(
            'name, ...options',
            'name, ...options, capacity: Math.min(options.capacity || 512,512)',
        )
    if name == 'particles/ParticleSystem.js':
        source = source.replace(
            'if (age < 0.0 || t > 1.0)',
            'if (life <= 0.0 || age < 0.0 || t > 1.0)',
        )
    parts.append(
        json.dumps(name) + ':function(require,exports){\n' + source
        + '\nObject.assign(exports,{' + ','.join(exports) + '});\n}'
    )

license_text = (ROOT / 'vendor/REFERENCE-LICENSE.txt').read_text()
OUTPUT.write_text(
    '/* Directly bundled reference modules.\n' + license_text
    + '*/\nconst SixModules=(()=>{const modules={' + ',\n'.join(parts)
    + '};const cache={};return function require(id){if(id==="three")return THREE;'
    + 'if(cache[id])return cache[id];const e=cache[id]={};'
    + 'modules[id](require,e);return e;};})();\n'
)
print('Bundled', len(parts), 'reference modules')
