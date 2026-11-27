// Prueba rápida del generador de Data.lua: node scripts/test-addon-lua.mjs
import assert from 'node:assert/strict'
import { buildDataLua, deriveAddonsPath, luaString, parseInterfaceVersion } from '../electron/main/addon-lua.ts'

assert.equal(luaString('a"b\\c\nd'), '"a\\"b\\\\c\\nd"')
assert.equal(luaString('Café “Élan”'), '"Café “Élan”"')
assert.equal(luaString('x\u0001y'), '"x\\001y"')

assert.equal(
  deriveAddonsPath('D:\\World of Warcraft\\_retail_\\WTF\\Account\\ACC\\SavedVariables'),
  'D:\\World of Warcraft\\_retail_\\Interface\\AddOns'
)
assert.equal(deriveAddonsPath('D:\\nowhere'), '')
assert.equal(parseInterfaceVersion('## Interface: 120105, 50504\n'), '120105')

const lua = buildDataLua(
  {
    generated_at: '2026-11-27T15:00:00Z',
    realms: [
      {
        name: "Kil'jaeden",
        slug: 'kiljaeden',
        tsm_search: 'Foo "Bar"/exact',
        items: [{ id: 5, name: 'Foo "Bar"', need: 2, target: 3, owned: 1, buy_price: 10.5, sell_realm: 'X', tsm: 'Foo "Bar"/exact' }]
      }
    ]
  },
  'abc123',
  '2026-11-27T15:01:00Z'
)
assert.match(lua, /^GoblinCompanionData = \{/m)
assert.match(lua, /name = "Kil'jaeden"/)
assert.match(lua, /name = "Foo \\"Bar\\"", need = 2, target = 3, owned = 1, buy_price = 10\.5/)
console.log(lua)
console.log('addon-lua OK')
