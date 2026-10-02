import test from 'node:test';
import assert from 'node:assert/strict';
import { unflatten, parseSvelteKitData } from '../src/unflatten.js';

test('unflatten - restores primitive and nested object references', () => {
  const input = [
    { name: 1, age: 2, meta: 3 },
    'Gon Freecss',
    14,
    { anime: 4, rank: 5 },
    'Hunter x Hunter',
    1
  ];

  const result = unflatten(input);
  assert.equal(result.name, 'Gon Freecss');
  assert.equal(result.age, 14);
  assert.deepEqual(result.meta, { anime: 'Hunter x Hunter', rank: 1 });
});

test('unflatten - restores array structures', () => {
  const input = [
    [1, 2, 3],
    'A',
    'B',
    'C'
  ];

  const result = unflatten(input);
  assert.deepEqual(result, ['A', 'B', 'C']);
});

test('parseSvelteKitData - parses multiline streamed chunks', () => {
  const stream = [
    '{"type":"data","nodes":[null,{"type":"data","data":[{"title":1,"epNum":2},"Dandadan",1]}]}',
    '{"type":"chunk","id":1,"data":[{"status":1},"ok"]}'
  ].join('\n');

  const parsed = parseSvelteKitData(stream);
  assert.ok(parsed);
  assert.equal(parsed.data?.title, 'Dandadan');
  assert.equal(parsed.data?.epNum, 1);
  assert.equal(parsed.chunks.length, 1);
  assert.equal(parsed.chunks[0].data?.status, 'ok');
});
