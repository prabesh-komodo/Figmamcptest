const fs = require('fs');
const path = require('path');
const { default: tsBlankSpace } = require('ts-blank-space');

const LWC_ROOT = path.join('force-app', 'main', 'default', 'lwc');

// ts-blank-space strips TypeScript type annotations by replacing them with
// whitespace, leaving all JavaScript — including @wire/@api/@track decorators —
// completely untouched. This is necessary because tsc and esbuild both compile
// decorators into __decorate/__decorateElement boilerplate that LWC's server-side
// compiler does not understand (LWC1503).

const components = fs.readdirSync(LWC_ROOT);

for (const comp of components) {
    const srcDir = path.join(LWC_ROOT, comp, 'src');
    if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) continue;

    for (const file of fs.readdirSync(srcDir)) {
        if (!file.endsWith('.ts')) continue;

        const from = path.join(srcDir, file);
        const to = path.join(LWC_ROOT, comp, file.replace(/\.ts$/, '.js'));

        const tsSource = fs.readFileSync(from, 'utf8');
        const jsOutput = tsBlankSpace(tsSource);
        fs.writeFileSync(to, jsOutput, 'utf8');

        console.log(`  ${path.relative('.', to)}`);
    }
}
