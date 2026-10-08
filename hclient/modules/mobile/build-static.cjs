const fs = require('node:fs')
const path = require('node:path')

const output = path.join(__dirname, 'dist')
for (const name of ['manifest.json', 'sw.js', 'icons']) {
  fs.cpSync(path.join(__dirname, name), path.join(output, name), { recursive: true })
}
// The manifest's relative start URL and icon paths must resolve from dist/.
const index = path.join(output, 'index.html')
fs.writeFileSync(index, fs.readFileSync(index, 'utf8')
  .replace(/(<link rel="manifest" href=")[^"]+("\s*>)/, '$1./manifest.json$2'))
