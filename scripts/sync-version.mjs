// Đồng bộ "version" trong package.json theo src/version.ts (nguồn duy nhất).
import { readFileSync, writeFileSync } from 'node:fs'
const version = /APP_VERSION = '([^']+)'/.exec(readFileSync('src/version.ts', 'utf8'))[1]
for (const file of ['package.json', 'package-lock.json']) {
  const json = JSON.parse(readFileSync(file, 'utf8'))
  json.version = version
  if (json.packages?.['']) json.packages[''].version = version
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n')
}
console.log('version', version)
