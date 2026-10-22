import { Game, SHAPES, COLORS, WIDTH, HEIGHT, bestMove, seededRandom } from './engine.js';
import { initPwa } from './pwa.js';
import { initLandingVideo } from './landing.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#board');
const ctx = canvas.getContext('2d');
const cell = canvas.width / WIDTH;
const images = {};
const preview = initLandingVideo();
let game = new Game();
let state = 'idle';
let pausedFrom = 'playing';
let gravity = 0;
let lockTime = 0;
let lockResets = 0;
let lastTime = 0;
let demoTime = 0;
let demoMode = false;
let demoPlan = null;
let lastPiece = 0;
let sound = false;
let audio;
let showPortraits = true;
let best = 0;
let storageAvailable = true;
let toastTimer;

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 6500);
}
function announce(message) { $('#announcement').textContent = message; }
function readPreference(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; }
  catch (error) {
    console.warn('Local preferences are unavailable:', error);
    storageAvailable = false;
    toast('Browser storage is unavailable. Scores and settings will last for this visit only.');
    return fallback;
  }
}
function savePreference(key, value) {
  if (!storageAvailable) return;
  try { localStorage.setItem(key, value); }
  catch (error) {
    console.warn('Could not save local preferences:', error);
    storageAvailable = false;
    toast('Your browser could not save this score or setting. It will last for this visit only.');
  }
}
const savedBest = Number(readPreference('katelyn-best', '0'));
if (!Number.isSafeInteger(savedBest) || savedBest < 0) {
  console.warn('Invalid saved classic best score:', savedBest);
  toast('Your saved best score was invalid and could not be restored.');
} else {
  best = savedBest;
}
showPortraits = readPreference('katelyn-portraits', 'true') === 'true';
$('#portraits').checked = showPortraits;

function tone(frequency = 440, duration = 0.07) {
  if (!sound || !audio || audio.state !== 'running') return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.055, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + duration);
}
$('#sound').addEventListener('click', async () => {
  try {
    if (!audio) audio = new AudioContext();
    await audio.resume();
    sound = !sound;
    $('#sound').setAttribute('aria-pressed', String(sound));
    $('#sound').setAttribute('aria-label', `Turn sound ${sound ? 'off' : 'on'}`);
    $('#sound').title = `Sound ${sound ? 'on' : 'off'}`;
    tone(523);
  } catch (error) {
    console.error('Unable to enable audio:', error);
    toast('Sound could not start in this browser. You can still play without it.');
  }
});

function drawTile(x, y, type, ghost = false) {
  const left = x * cell + 2;
  const top = y * cell + 2;
  const size = cell - 4;
  if (ghost) {
    ctx.strokeStyle = COLORS[type];
    ctx.globalAlpha = 0.62;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(left + 2, top + 2, size - 4, size - 4, 5);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(left, top, size, size, 6);
  ctx.clip();
  ctx.fillStyle = COLORS[type];
  ctx.fillRect(left, top, size, size);
  if (showPortraits && images[type]) {
    const image = images[type];
    ctx.drawImage(image, 0, 0, image.width, image.width, left + 3, top + 3, size - 6, size - 6);
    ctx.fillStyle = `${COLORS[type]}22`;
    ctx.fillRect(left, top, size, size);
  } else {
    ctx.fillStyle = '#ffffff20';
    ctx.fillRect(left, top, size, size / 3);
  }
  ctx.strokeStyle = '#ffffff44';
  ctx.lineWidth = 2;
  ctx.strokeRect(left + 1, top + 1, size - 2, size - 2);
  ctx.restore();
}
function renderBoard() {
  ctx.fillStyle = '#302347';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#d9c8ef0e';
  ctx.lineWidth = 1;
  for (let x = 0; x <= WIDTH; x++) {
    ctx.beginPath(); ctx.moveTo(x * cell, 0); ctx.lineTo(x * cell, canvas.height); ctx.stroke();
  }
  for (let y = 0; y <= HEIGHT; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * cell); ctx.lineTo(canvas.width, y * cell); ctx.stroke();
  }
  if (state === 'idle') {
    const display = [
      '..........', '..........', '..........', '..........',
      '..........', '..........', '..........', '..........',
      '..........', '..........', '..........', '..........',
      '..........', '..........', '.T........', 'TTT.......',
      'J..SS...LL', 'J.SS.OO.L.', 'JJZZ.OO.L.', 'IIIZZTTTSS',
    ];
    display.forEach((row, y) => [...row].forEach((type, x) => {
      if (type !== '.') drawTile(x, y, type);
    }));
    return;
  }
  game.board.forEach((row, y) => row.forEach((type, x) => { if (type) drawTile(x, y, type); }));
  if (state !== 'over') {
    const ghostY = game.ghostY();
    game.active.matrix.forEach((row, dy) => row.forEach((occupied, dx) => {
      if (!occupied) return;
      if (ghostY + dy >= 0) drawTile(game.active.x + dx, ghostY + dy, game.active.type, true);
      if (game.active.y + dy >= 0) drawTile(game.active.x + dx, game.active.y + dy, game.active.type);
    }));
  }
}
function miniPiece(type) {
  const element = document.createElement('div');
  element.className = 'mini-piece';
  element.setAttribute('aria-label', `${type} piece`);
  element.setAttribute('role', 'img');
  const rows = SHAPES[type].filter(row => row.some(Boolean));
  const occupiedColumns = rows[0].map((_, i) => rows.some(row => row[i]));
  element.style.gridTemplateColumns = `repeat(${occupiedColumns.filter(Boolean).length}, 1fr)`;
  for (const row of rows) {
    row.forEach((occupied, x) => {
      if (!occupiedColumns[x]) return;
      const tile = document.createElement('span');
      tile.className = occupied ? 'mini-cell' : 'mini-cell empty';
      if (occupied) {
        tile.style.setProperty('--cell-color', COLORS[type]);
        if (showPortraits && images[type]) tile.style.backgroundImage = `url("./assets/${type}.jpg")`;
      }
      element.append(tile);
    });
  }
  return element;
}
function renderPanels() {
  $('#score').textContent = String(game.score).padStart(6, '0');
  $('#best').textContent = best.toLocaleString();
  $('#level').textContent = String(game.level).padStart(2, '0');
  $('#lines').textContent = String(game.lines).padStart(2, '0');
  $('#level-progress').style.width = `${game.lines % 10 * 10}%`;
  $('#level-caption').textContent = `${10 - game.lines % 10} lines to your next level`;
  $('#next').replaceChildren(...game.queue.slice(0, 3).map(miniPiece));
  if (game.held) $('#hold').replaceChildren(miniPiece(game.held));
  else {
    const message = document.createElement('span');
    message.textContent = 'Save a little something for later.';
    $('#hold').replaceChildren(message);
  }
  $('#hold').classList.toggle('used', game.holdUsed);
  canvas.dataset.pieces = String(game.pieces);
  canvas.dataset.active = game.active?.type || '';
  canvas.dataset.x = String(game.active?.x ?? '');
  canvas.dataset.y = String(game.active?.y ?? '');
  for (const button of document.querySelectorAll('[data-action]')) {
    button.disabled = state !== 'playing' || (button.dataset.action === 'hold' && game.holdUsed);
  }
}
function setState(next) {
  state = next;
  canvas.dataset.state = state;
  $('#pause').disabled = !['playing', 'demo', 'paused'].includes(state);
  $('#pause').setAttribute('aria-label', state === 'paused' ? 'Resume game' : 'Pause game');
  $('#pause').innerHTML = state === 'paused' ? '&#9654; <span>Resume</span>' : 'II <span>Pause</span>';
  $('#state-label').textContent = { idle: 'YOUR HAPPY PLACE', playing: 'IN YOUR ELEMENT', demo: 'SIMULATED PLAY', paused: 'TAKE YOUR TIME', over: 'A LOVELY LITTLE BREAK' }[state];
  $('#overlay').hidden = state === 'playing' || state === 'demo';
  $('#demo').hidden = state === 'paused';
  renderBoard();
}
function start(demo = false) {
  preview.pause();
  game = new Game(demo ? seededRandom(64) : Math.random);
  demoMode = demo;
  pausedFrom = demo ? 'demo' : 'playing';
  gravity = 0; lockTime = 0; lockResets = 0; demoTime = 0;
  demoPlan = null; lastPiece = 0;
  setState(demo ? 'demo' : 'playing');
  $('#game-hint').textContent = demo ? 'Simulated play. Start fresh to make it yours.' : 'You have room to make something lovely.';
  renderPanels();
  canvas.focus({ preventScroll: true });
  if ($('#play').getBoundingClientRect().bottom > innerHeight - 12) {
    $('#play').scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  announce(demo ? 'Simulated game started. Scores are not saved.' : 'New game started.');
}
function afterAction() {
  if (!demoMode && game.score > best) {
    best = game.score;
    savePreference('katelyn-best', String(best));
  }
  if (game.pieces !== lastPiece) {
    lastPiece = game.pieces;
    lockTime = 0; lockResets = 0; gravity = 0; demoPlan = null;
    if (game.lastClear) {
      const message = `${game.lastClear} ${game.lastClear === 1 ? 'line' : 'lines'} cleared. A little more room to shine.`;
      $('#game-hint').textContent = message;
      announce(`${message} Score ${game.score}. Level ${game.level}.`);
      $('#clear-flash').classList.remove('flash');
      void $('#clear-flash').offsetWidth;
      $('#clear-flash').classList.add('flash');
      tone(659, 0.2);
    }
  }
  if (game.over) {
    setState('over');
    $('#overlay-kicker').textContent = demoMode ? 'A LITTLE INSPIRATION' : 'LOOK WHAT YOU MADE';
    $('#overlay-title').innerHTML = 'Nicely<br><em>played.</em>';
    $('#overlay-description').textContent = `${game.score.toLocaleString()} points. ${game.lines} lines. Another fresh start is waiting.`;
    $('#start').textContent = "Let's play again";
    announce(`Game over. ${game.score} points and ${game.lines} lines.`);
  }
  renderPanels();
  renderBoard();
}
function pause() {
  if (state !== 'playing' && state !== 'demo') return;
  pausedFrom = state;
  setState('paused');
  $('#overlay-kicker').textContent = 'NO RUSH AT ALL';
  $('#overlay-title').innerHTML = 'Take a<br><em>breather.</em>';
  $('#overlay-description').textContent = 'Your blocks will be right here.';
  $('#start').textContent = 'Keep playing';
  renderPanels();
  announce('Game paused.');
}
function resume() {
  if (state !== 'paused') return;
  lastTime = performance.now();
  setState(pausedFrom);
  renderPanels();
  canvas.focus({ preventScroll: true });
}
function action(name) {
  if (state !== 'playing') return;
  const wasGrounded = !game.fits({ ...game.active, y: game.active.y + 1 });
  let changed = false;
  if (name === 'left') changed = game.move(-1);
  if (name === 'right') changed = game.move(1);
  if (name === 'rotate') changed = game.rotate();
  if (name === 'reverse') changed = game.rotate(-1);
  if (name === 'down') changed = game.softDrop();
  if (name === 'drop') { game.hardDrop(); changed = true; tone(261, 0.1); }
  if (name === 'hold') {
    changed = game.hold();
    if (changed) { gravity = 0; lockTime = 0; lockResets = 0; }
    else toast('Hold is available again after this piece locks.');
  }
  if (changed && wasGrounded && ['left', 'right', 'rotate', 'reverse'].includes(name) && lockResets < 15) {
    lockTime = 0;
    lockResets++;
  }
  if (changed) afterAction();
}
$('#start').addEventListener('click', () => {
  if (state === 'paused') resume();
  else start();
});
$('#demo').addEventListener('click', () => start(true));
$('#jump-to-game').addEventListener('click', () => {
  preview.pause();
  $('#play').scrollIntoView({ block: 'start' });
  canvas.focus({ preventScroll: true });
});
$('#pause').addEventListener('click', () => state === 'paused' ? resume() : pause());
$('#portraits').addEventListener('change', event => {
  showPortraits = event.target.checked;
  savePreference('katelyn-portraits', String(showPortraits));
  renderBoard(); renderPanels();
});

const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'rotate', x: 'rotate', z: 'reverse', ' ': 'drop', c: 'hold', Shift: 'hold' };
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return;
  if (event.target instanceof HTMLElement && event.target.closest('button, a, input, select, textarea, video')) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (key === 'p' || key === 'Escape') {
    if (!['playing', 'demo', 'paused'].includes(state)) return;
    event.preventDefault();
    if (!event.repeat) state === 'paused' ? resume() : pause();
  } else if (keys[key] && state === 'playing') {
    event.preventDefault();
    if (!event.repeat || ['left', 'right', 'down'].includes(keys[key])) action(keys[key]);
  }
});

let repeatDelay;
let repeatInterval;
function stopRepeat() { clearTimeout(repeatDelay); clearInterval(repeatInterval); }
for (const button of document.querySelectorAll('[data-action]')) {
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    stopRepeat();
    button.setPointerCapture(event.pointerId);
    const name = button.dataset.action;
    action(name);
    if (['left', 'right', 'down'].includes(name)) {
      repeatDelay = setTimeout(() => { repeatInterval = setInterval(() => action(name), 80); }, 220);
    }
  });
  button.addEventListener('pointerup', stopRepeat);
  button.addEventListener('pointercancel', stopRepeat);
  button.addEventListener('lostpointercapture', stopRepeat);
  button.addEventListener('click', event => { if (event.detail === 0) action(button.dataset.action); });
}
let gesture;
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || state !== 'playing') return;
  canvas.setPointerCapture(event.pointerId);
  gesture = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
});
canvas.addEventListener('pointermove', event => {
  if (!gesture) return;
  const threshold = Math.max(16, canvas.getBoundingClientRect().width / WIDTH);
  const delta = event.clientX - gesture.x;
  if (Math.abs(delta) >= threshold) {
    const steps = Math.floor(Math.abs(delta) / threshold);
    for (let i = 0; i < steps; i++) action(delta > 0 ? 'right' : 'left');
    gesture.x += Math.sign(delta) * steps * threshold;
    gesture.moved = true;
  }
});
canvas.addEventListener('pointerup', event => {
  if (!gesture) return;
  const dx = event.clientX - gesture.startX;
  const dy = event.clientY - gesture.startY;
  if (dy > 55 && Math.abs(dx) < 40) action('drop');
  else if (!gesture.moved && Math.abs(dy) < 15 && Math.abs(dx) < 15) action('rotate');
  gesture = null;
});
canvas.addEventListener('pointercancel', () => { gesture = null; });
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopRepeat(); pause(); } });
window.addEventListener('blur', () => { stopRepeat(); pause(); });

let resumeAfterDialog = false;
$('#restart').addEventListener('click', () => {
  if (!['playing', 'demo', 'paused'].includes(state)) { start(); return; }
  resumeAfterDialog = state === 'playing' || state === 'demo';
  pause();
  $('#restart-dialog').showModal();
});
$('#cancel-restart').addEventListener('click', () => $('#restart-dialog').close());
$('#restart-dialog').addEventListener('close', () => { if (resumeAfterDialog) resume(); });
$('#confirm-restart').addEventListener('click', () => {
  resumeAfterDialog = false;
  $('#restart-dialog').close();
  start();
});

function demoStep() {
  if (!demoPlan) demoPlan = bestMove(game);
  if (!demoPlan) { game.hardDrop(); afterAction(); return; }
  if (demoPlan.rotation > 0) {
    if (!game.rotate()) { game.hardDrop(); afterAction(); return; }
    demoPlan.rotation--;
  } else if (game.active.x !== demoPlan.x) {
    if (!game.move(Math.sign(demoPlan.x - game.active.x))) game.hardDrop();
  } else if (game.active.y < Math.min(8, game.ghostY() - 2)) {
    for (let i = 0; i < 3; i++) game.move(0, 1);
  } else {
    game.hardDrop();
  }
  afterAction();
}
function tick(now) {
  const delta = Math.min(now - (lastTime || now), 100);
  lastTime = now;
  if (state === 'demo') {
    demoTime += delta;
    if (demoTime >= 85) { demoTime = 0; demoStep(); }
  } else if (state === 'playing') {
    gravity += delta;
    const interval = Math.max(75, 850 * Math.pow(0.8, game.level - 1));
    if (gravity >= interval) {
      gravity %= interval;
      game.move(0, 1);
      renderPanels();
    }
    if (!game.fits({ ...game.active, y: game.active.y + 1 })) {
      lockTime += delta;
      if (lockTime >= 500) { game.lock(); afterAction(); }
    } else {
      lockTime = 0;
    }
    renderBoard();
  }
  requestAnimationFrame(tick);
}

setState('idle');
renderPanels();
Promise.all(Object.keys(SHAPES).map(type => new Promise(resolve => {
  const image = new Image();
  image.onload = () => { images[type] = image; resolve(); };
  image.onerror = () => {
    console.error(`Portrait asset failed to load: ${type}.jpg`);
    toast('A portrait could not load. A solid-color tile is shown; reconnect and reload to restore photos.');
    resolve();
  };
  image.src = `./assets/${type}.jpg`;
}))).then(() => { renderBoard(); renderPanels(); });
initPwa(toast, pause);
if (new URL(location.href).searchParams.has('demo')) start(true);
requestAnimationFrame(tick);
