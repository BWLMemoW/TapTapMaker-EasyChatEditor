import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRegister, getExpressions, getDisplayName, getDefaultPosition } from '../src/register.js';

const SAMPLE = JSON.stringify({
  ui_elements: {
    custom_buttons: [
      { id: 'ec_shop_btn', style: 'default', label: '商店', signal: 'open_shop' }
    ]
  },
  characters: [
    { id: 'alice', display_name: '爱丽丝', sprites: { default: 'a.png', happy: 'h.png' }, default_position: 'center' }
  ],
  scenes: [{ id: 'bg_classroom', type: 'background' }],
  audios: [{ id: 'bgm_daily', type: 'bgm', volume: 0.7, loop: true }],
  decorations: [{ id: 'vignette', description: '暗角' }],
  variables: { affection_alice: 0 },
  flags: ['gave_gift']
});

test('parseRegister 建立索引', () => {
  const reg = parseRegister(SAMPLE);
  assert.equal(reg.ok, true);
  assert.equal(reg.characters.size, 1);
  assert.equal(reg.scenes.get('bg_classroom').type, 'background');
  assert.equal(reg.audios.get('bgm_daily').volume, 0.7);
  assert.equal(reg.decorations.get('vignette').description, '暗角');
  assert.equal(reg.variables.get('affection_alice'), 0);
  assert.ok(reg.flags.has('gave_gift'));
  assert.equal(reg.customButtons.length, 1);
  assert.equal(reg.customButtons[0].signal, 'open_shop');
});

test('parseRegister 对坏 JSON 返回 ok=false', () => {
  const reg = parseRegister('{bad json');
  assert.equal(reg.ok, false);
  assert.match(reg.error, /JSON/);
});

test('辅助函数', () => {
  const reg = parseRegister(SAMPLE);
  assert.deepEqual(getExpressions(reg, 'alice'), ['default', 'happy']);
  assert.equal(getDisplayName(reg, 'alice'), '爱丽丝');
  assert.equal(getDefaultPosition(reg, 'alice'), 'center');
  assert.deepEqual(getExpressions(reg, 'nobody'), []);
});
