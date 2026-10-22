export const WIDTH = 10;
export const HEIGHT = 20;
export const COLORS = { I: '#51bfc6', O: '#edbd56', T: '#aa8ed1', S: '#74b890', Z: '#e68885', J: '#729bdb', L: '#e9a26b' };
export const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};
export const emptyBoard = () => Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(null));
export const rotateMatrix = (matrix, direction = 1) => matrix.map((row, y) => row.map((_, x) =>
  direction === 1 ? matrix[matrix.length - 1 - x][y] : matrix[x][matrix.length - 1 - y]));

export function seededRandom(seed = 42) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// SRS offsets use screen coordinates (positive y points down).
const JLSTZ_KICKS = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};
const I_KICKS = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

export class Game {
  constructor(random = Math.random) {
    this.random = random;
    this.board = emptyBoard();
    this.queue = [];
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.held = null;
    this.holdUsed = false;
    this.over = false;
    this.pieces = 0;
    this.lastClear = 0;
    this.fillQueue();
    this.spawn();
  }
  fillQueue() {
    while (this.queue.length < 7) {
      const bag = Object.keys(SHAPES);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      this.queue.push(...bag);
    }
  }
  spawn(type) {
    if (!type) {
      type = this.queue.shift();
      this.fillQueue();
    }
    this.active = { type, matrix: SHAPES[type].map(row => [...row]), x: Math.floor((WIDTH - SHAPES[type].length) / 2), y: -1, rotation: 0 };
    if (!this.fits(this.active)) this.over = true;
  }
  fits(piece, board = this.board) {
    return piece.matrix.every((row, dy) => row.every((cell, dx) => {
      if (!cell) return true;
      const x = piece.x + dx;
      const y = piece.y + dy;
      return x >= 0 && x < WIDTH && y < HEIGHT && (y < 0 || !board[y][x]);
    }));
  }
  move(dx, dy = 0) {
    if (this.over) return false;
    const next = { ...this.active, x: this.active.x + dx, y: this.active.y + dy };
    if (!this.fits(next)) return false;
    this.active = next;
    return true;
  }
  rotate(direction = 1) {
    if (this.over || this.active.type === 'O') return false;
    const next = (this.active.rotation + (direction === 1 ? 1 : 3)) % 4;
    const matrix = rotateMatrix(this.active.matrix, direction);
    const kicks = this.active.type === 'I' ? I_KICKS : JLSTZ_KICKS;
    for (const [dx, dy] of kicks[`${this.active.rotation}>${next}`]) {
      const piece = { ...this.active, matrix, rotation: next, x: this.active.x + dx, y: this.active.y + dy };
      if (this.fits(piece)) {
        this.active = piece;
        return true;
      }
    }
    return false;
  }
  ghostY() {
    if (!this.active) return -1;
    let y = this.active.y;
    while (this.fits({ ...this.active, y: y + 1 })) y++;
    return y;
  }
  softDrop() {
    if (this.move(0, 1)) {
      this.score++;
      return true;
    }
    return false;
  }
  hardDrop() {
    if (this.over) return;
    const y = this.ghostY();
    this.score += (y - this.active.y) * 2;
    this.active.y = y;
    this.lock();
  }
  lock() {
    if (this.over) return;
    const { type, matrix, x, y } = this.active;
    if (matrix.some((row, dy) => row.some(cell => cell && y + dy < 0))) {
      this.over = true;
      return;
    }
    matrix.forEach((row, dy) => row.forEach((cell, dx) => {
      if (cell) this.board[y + dy][x + dx] = type;
    }));
    this.lastClear = this.board.filter(row => row.every(Boolean)).length;
    this.board = this.board.filter(row => !row.every(Boolean));
    while (this.board.length < HEIGHT) this.board.unshift(Array(WIDTH).fill(null));
    this.score += [0, 100, 300, 500, 800][this.lastClear] * this.level;
    this.lines += this.lastClear;
    this.level = 1 + Math.floor(this.lines / 10);
    this.pieces++;
    this.holdUsed = false;
    this.spawn();
  }
  hold() {
    if (this.over || this.holdUsed) return false;
    const old = this.held;
    this.held = this.active.type;
    this.spawn(old);
    this.holdUsed = true;
    return true;
  }
}

export function bestMove(game) {
  let best = null;
  let matrix = game.active.matrix;
  for (let rotation = 0; rotation < 4; rotation++) {
    for (let x = -3; x < WIDTH; x++) {
      const piece = { ...game.active, matrix, x };
      if (!game.fits(piece)) continue;
      while (game.fits({ ...piece, y: piece.y + 1 })) piece.y++;
      if (matrix.some((row, dy) => row.some(cell => cell && piece.y + dy < 0))) continue;
      let board = game.board.map(row => [...row]);
      matrix.forEach((row, dy) => row.forEach((cell, dx) => {
        if (cell) board[piece.y + dy][x + dx] = piece.type;
      }));
      const cleared = board.filter(row => row.every(Boolean)).length;
      board = board.filter(row => !row.every(Boolean));
      while (board.length < HEIGHT) board.unshift(Array(WIDTH).fill(null));
      let holes = 0;
      const heights = Array.from({ length: WIDTH }, (_, column) => {
        const top = board.findIndex(row => row[column]);
        if (top < 0) return 0;
        holes += board.slice(top).filter(row => !row[column]).length;
        return HEIGHT - top;
      });
      const bumpiness = heights.slice(1).reduce((sum, height, i) => sum + Math.abs(height - heights[i]), 0);
      const value = cleared * 8 - holes * 7 - heights.reduce((a, b) => a + b, 0) * 0.52 - bumpiness * 0.24;
      if (!best || value > best.value) best = { rotation, x, value };
    }
    matrix = rotateMatrix(matrix);
  }
  return best;
}
