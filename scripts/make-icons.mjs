// Tạo icon PWA từ public/favicon.svg: node scripts/make-icons.mjs
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync('public/favicon.svg', 'utf8')
const square = svg.replace('rx="14"', 'rx="0"')
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#6D371A"/><g transform="translate(9.6 9.6) scale(.7)">${square.replace(/<\/?svg[^>]*>/g, '')}</g></svg>`
const png = (source, size) => new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng()

writeFileSync('public/pwa-192.png', png(svg, 192))
writeFileSync('public/pwa-512.png', png(svg, 512))
writeFileSync('public/pwa-maskable-512.png', png(maskable, 512))
writeFileSync('public/apple-touch-icon.png', png(square, 180))
