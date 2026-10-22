import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, SHAPES, WIDTH, HEIGHT, emptyBoard, rotateMatrix, seededRandom, bestMove } from '../public/engine.js';

const practice = () => new Game(seededRandom(64));

test('board has twenty independent ten-cell rows', () => {
  const board = emptyBoard();
  assert.equal(board.length, HEIGHT);
  assert.ok(board.every(row => row.length === WIDTH));
  board[0][0] = 'T';
  assert.equal(board[1][0], null);
});
test('every seven-bag contains each shape once and the queue keeps refilling', () => {
  const game = practice();
  const types = [game.active.type];
  for (let i = 0; i < 69; i++) {
    game.spawn();
    types.push(game.active.type);
    assert.ok(game.queue.length >= 7);
  }
  for (let i = 0; i < types.length; i += 7) assert.equal(new Set(types.slice(i, i + 7)).size, 7);
});
test('new games have independent empty boards and deterministic demo sequences', () => {
  const a = practice();
  const b = practice();
  assert.deepEqual(a.board, b.board);
  assert.ok(a.board.every(row => row.every(cell => cell === null)));
  assert.deepEqual(a.queue, b.queue);
  a.board[19][0] = 'T';
  a.hold();
  assert.equal(b.board[19][0], null);
});
test('rotation is reversible and four turns preserve shapes', () => {
  for (const shape of Object.values(SHAPES)) {
    assert.deepEqual(rotateMatrix(rotateMatrix(shape), -1), shape);
    let rotated = shape;
    for (let i = 0; i < 4; i++) rotated = rotateMatrix(rotated);
    assert.deepEqual(rotated, shape);
  }
});
test('pieces cannot pass side walls, floor, or occupied cells', () => {
  const game = practice();
  game.spawn('O');
  while (game.move(-1)) { /* Move to wall. */ }
  assert.equal(game.active.x, 0);
  assert.equal(game.move(-1), false);
  game.active.y = 18;
  assert.equal(game.move(0, 1), false);
  game.board[18][2] = 'J';
  assert.equal(game.move(1), false);
});
test('SRS wall kick rotates a T piece away from the left wall', () => {
  const game = practice();
  game.spawn('T');
  game.active.y = 3;
  assert.ok(game.rotate());
  while (game.move(-1)) { /* Move to wall. */ }
  assert.equal(game.active.x, -1);
  assert.ok(game.rotate());
  assert.equal(game.active.x, 0);
  assert.ok(game.fits(game.active));
});
test('SRS floor kick rotates a horizontal I piece', () => {
  const game = practice();
  game.spawn('I');
  game.active.y = 18;
  assert.ok(game.fits(game.active));
  assert.ok(game.rotate());
  assert.ok(game.fits(game.active));
  assert.equal(game.active.rotation, 1);
});
test('O rotation has no position drift', () => {
  const game = practice();
  game.spawn('O');
  const initial = structuredClone(game.active);
  assert.equal(game.rotate(), false);
  assert.deepEqual(game.active, initial);
});
test('hold works once per piece and resets held orientation on retrieval', () => {
  const game = practice();
  const first = game.active.type;
  game.rotate();
  assert.ok(game.hold());
  assert.equal(game.held, first);
  assert.equal(game.hold(), false);
  game.hardDrop();
  assert.ok(game.hold());
  assert.equal(game.active.type, first);
  assert.equal(game.active.rotation, 0);
});
test('ghost and hard drop agree; hard drop scores two per traversed row', () => {
  const game = practice();
  game.spawn('O');
  assert.equal(game.ghostY(), 18);
  game.hardDrop();
  assert.equal(game.score, 38);
  assert.equal(game.pieces, 1);
  assert.equal(game.board[19][4], 'O');
});
test('soft drop awards one point only for successful movement', () => {
  const game = practice();
  game.spawn('O');
  game.active.y = 17;
  assert.equal(game.softDrop(), true);
  assert.equal(game.score, 1);
  assert.equal(game.softDrop(), false);
  assert.equal(game.score, 1);
});
for (const count of [1, 2, 3, 4]) {
  test(`${count}-line clear scores correctly and compacts the board`, () => {
    const game = practice();
    for (let y = HEIGHT - count; y < HEIGHT; y++) {
      game.board[y] = Array(WIDTH).fill('J');
      game.board[y][4] = null;
    }
    game.active = { type: 'I', matrix: [[1], [1], [1], [1]], x: 4, y: HEIGHT - 4, rotation: 1 };
    game.lock();
    assert.equal(game.lines, count);
    assert.equal(game.lastClear, count);
    assert.equal(game.score, [0, 100, 300, 500, 800][count]);
    assert.equal(game.board.length, HEIGHT);
    assert.ok(game.board[0].every(cell => cell === null));
  });
}
test('clearing the entire board continues classic play with another piece', () => {
  const game = practice();
  game.board[19] = ['J', 'J', 'J', null, null, null, null, 'J', 'J', 'J'];
  game.spawn('I');
  game.hardDrop();
  assert.equal(game.over, false);
  assert.ok(game.active);
  assert.ok(game.queue.length >= 7);
  assert.equal(game.lines, 1);
  assert.ok(game.board.every(row => row.every(cell => cell === null)));
});
test('spawn collision ends the game without allowing more actions', () => {
  const game = practice();
  game.board[0].fill('I');
  game.spawn('O');
  assert.equal(game.over, true);
  assert.equal(game.move(1), false);
  assert.equal(game.hold(), false);
  assert.equal(game.rotate(), false);
});
test('locking above the board ends game without partial writes', () => {
  const game = practice();
  game.spawn('O');
  const before = structuredClone(game.board);
  game.lock();
  assert.equal(game.over, true);
  assert.deepEqual(game.board, before);
});
test('level increases every ten lines and scores clears at the previous level', () => {
  const game = practice();
  game.lines = 9;
  for (const expected of [100, 300]) {
    game.board = emptyBoard();
    game.board[19] = Array(WIDTH).fill('J');
    game.board[19][4] = null;
    game.active = { type: 'I', matrix: [[1], [1], [1], [1]], x: 4, y: 16, rotation: 1 };
    game.lock();
    assert.equal(game.level, 2);
    assert.equal(game.score, expected);
  }
});
test('automated classic demo clears at least ten lines in eighty pieces', () => {
  const game = practice();
  for (let i = 0; i < 80 && !game.over; i++) {
    const plan = bestMove(game);
    assert.ok(plan);
    for (let r = 0; r < plan.rotation; r++) assert.ok(game.rotate());
    while (game.active.x !== plan.x) assert.ok(game.move(Math.sign(plan.x - game.active.x)));
    game.hardDrop();
  }
  assert.ok(game.lines >= 10);
  assert.equal(game.over, false);
  assert.equal(game.pieces, 80);
});
