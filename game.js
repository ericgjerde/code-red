(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const cheatMenuEl = document.getElementById('cheatMenu');
  const cheatToggleEl = document.getElementById('cheatToggle');
  const cheatCloseEl = document.getElementById('cheatClose');
  ctx.imageSmoothingEnabled = false;

  const VIEW_W = 960;
  const VIEW_H = 540;
  const GRAVITY = 1500;
  const MAX_DT = 1 / 30;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sign = v => (v < 0 ? -1 : 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rectsOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const circleRect = (c, r) => {
    const x = clamp(c.x, r.x, r.x + r.w);
    const y = clamp(c.y, r.y, r.y + r.h);
    const dx = c.x - x;
    const dy = c.y - y;
    return dx * dx + dy * dy <= c.r * c.r;
  };
  function roundRect(x, y, w, h, r = 6) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fillRoundRect(x, y, w, h, r, fill) {
    ctx.fillStyle = fill;
    roundRect(x, y, w, h, r);
    ctx.fill();
  }
  function strokeRoundRect(x, y, w, h, r, stroke, lw = 1) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    roundRect(x, y, w, h, r);
    ctx.stroke();
  }

  let cssW = 1, cssH = 1, dpr = 1, scale = 1, ox = 0, oy = 0;
  function resize() {
    cssW = window.innerWidth;
    cssH = window.innerHeight;
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    scale = Math.min(cssW / VIEW_W, cssH / VIEW_H);
    ox = (cssW - VIEW_W * scale) / 2;
    oy = (cssH - VIEW_H * scale) / 2;
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  resize();

  const input = {
    left: false, right: false, up: false, down: false,
    shoot: false, secondary: false, jump: false, switch: false, start: false,
    pause: false, mute: false,
    just: Object.create(null),
    mouse: { down: false, x: 0, y: 0 }
  };

  const keyMap = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    Space: 'jump',
    KeyF: 'shoot', KeyJ: 'shoot',
    KeyD: 'secondary',
    KeyR: 'switch', KeyE: 'switch',
    Enter: 'start',
    KeyP: 'pause', Escape: 'pause',
    KeyM: 'mute'
  };

  const cheats = { god: false, slowmo: false, hyper: false, party: false };
  let cheatMenuOpen = false;
  let cheatFlash = { text: '', life: 0 };

  function setCheatMenu(open) {
    cheatMenuOpen = open;
    cheatMenuEl.classList.toggle('open', open);
    cheatMenuEl.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) Object.keys(input).forEach(k => { if (typeof input[k] === 'boolean') input[k] = false; });
  }

  function flashCheat(text) {
    cheatFlash = { text, life: 2.4 };
    addText(text, camera.x + VIEW_W / 2 - 80, 92, '#ffcf40');
    beep(980, 0.12, 'square', 0.05, 1.7);
  }

  function spawnPowerRain() {
    const kinds = ['spread', 'laser', 'flame', 'rocket', 'heal', 'shield', 'dronepod', 'overdrive', 'boots', 'magnet', 'nova'];
    for (let i = 0; i < 14; i++) {
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      powerups.push({ kind, x: camera.x + rand(70, VIEW_W - 70), y: rand(-260, -30), w: 28, h: 28, vy: rand(-60, 60), life: 16, t: rand(0, 5) });
    }
  }

  function applyCheat(code) {
    if (!player && state === 'title') resetGame();
    if (!player) return;
    if (code === 'GODMODE' || code === 'IDDQD') {
      cheats.god = !cheats.god;
      if (cheats.god) {
        player.dead = false;
        player.respawn = 0;
        player.lives = Math.max(player.lives, 3);
        player.hp = player.maxHp;
        player.shield = 999;
        player.invuln = 999;
      } else {
        player.invuln = Math.min(player.invuln, 1.5);
      }
      flashCheat('GOD MODE ' + (cheats.god ? 'ON' : 'OFF'));
    } else if (code === 'SHIELD') {
      player.shield = 99;
      flashCheat('MEGA SHIELD');
    } else if (code === 'DRONES') {
      for (let i = 0; i < 8; i++) addDrone();
      flashCheat('DRONE SQUADRON +' + droneCount());
    } else if (code.startsWith('DRONE_')) {
      const d = addDrone(code.replace('DRONE_', '').toLowerCase());
      flashCheat((d?.name || 'DRONE').toUpperCase() + ' ADDED #' + droneCount());
    } else if (code.startsWith('GIVE_')) {
      const map = { GIVE_HEAL: 'heal', GIVE_SHIELD: 'shield', GIVE_OVERDRIVE: 'overdrive', GIVE_BOOTS: 'boots', GIVE_MAGNET: 'magnet', GIVE_NOVA: 'nova', GIVE_SPREAD: 'spread', GIVE_LASER: 'laser', GIVE_FLAME: 'flame', GIVE_ROCKET: 'rocket' };
      const kind = map[code];
      if (kind) grantPowerup(kind, player.x + player.w / 2, player.y - 20);
      flashCheat((powerupInfo(kind).name || kind).toUpperCase() + ' ADDED');
    } else if (code === 'GUNS') {
      weapons.forEach(w => player.unlocked.add(w.id));
      player.weapon = 'rocket';
      flashCheat('ALL WEAPONS');
    } else if (code === 'BOOTS') {
      player.boots = 90;
      flashCheat('MOON BOOTS');
    } else if (code === 'NUKE') {
      let killed = 0;
      for (const e of enemies) if (e.alive && e.x > camera.x - 120 && e.x < camera.x + VIEW_W + 220) { e.alive = false; killed++; startExplosion(e.x + e.w / 2, e.y + e.h / 2, '#ffcf40', 18, 0.9); }
      if (boss.active && !boss.dead) hurtBoss(35, boss.x + boss.w / 2, boss.y + boss.h / 2);
      score += killed * 250;
      camera.shake = 22;
      flashCheat('SCREEN NUKE');
    } else if (code === 'PARTY') {
      cheats.party = !cheats.party;
      flashCheat('PARTY MODE ' + (cheats.party ? 'ON' : 'OFF'));
    } else if (code === 'SLOWMO') {
      cheats.slowmo = !cheats.slowmo;
      flashCheat('SLOW-MO ' + (cheats.slowmo ? 'ON' : 'OFF'));
    } else if (code === 'HYPER') {
      cheats.hyper = !cheats.hyper;
      flashCheat('HYPER SOLDIER ' + (cheats.hyper ? 'ON' : 'OFF'));
    } else if (code === 'MONEY') {
      score += 50000;
      flashCheat('BIG SCORE');
    } else if (code === 'LIFE') {
      player.lives += 5;
      flashCheat('+5 LIVES');
    } else if (code === 'RAIN') {
      spawnPowerRain();
      flashCheat('POWERUP RAIN');
    }
  }

  cheatToggleEl.addEventListener('click', e => {
    e.preventDefault();
    unlockAudio();
    setCheatMenu(!cheatMenuOpen);
  });
  cheatCloseEl.addEventListener('click', e => {
    e.preventDefault();
    setCheatMenu(false);
  });
  cheatMenuEl.addEventListener('pointerdown', e => {
    e.stopPropagation();
    unlockAudio();
  });
  document.querySelectorAll('[data-cheat]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      applyCheat(btn.dataset.cheat);
    });
  });

  function setInput(name, value) {
    if (!name) return;
    if (value && !input[name]) input.just[name] = true;
    input[name] = value;
  }
  function consume(name) {
    const v = !!input.just[name];
    input.just[name] = false;
    return v;
  }

  window.addEventListener('keydown', e => {
    if (e.code === 'KeyC' || e.code === 'Backquote') {
      e.preventDefault();
      setCheatMenu(!cheatMenuOpen);
      return;
    }
    if (cheatMenuOpen) {
      if (e.code === 'Escape') setCheatMenu(false);
      e.preventDefault();
      return;
    }
    const name = keyMap[e.code];
    if (name) {
      e.preventDefault();
      setInput(name, true);
    }
  });
  window.addEventListener('keyup', e => {
    const name = keyMap[e.code];
    if (name) {
      e.preventDefault();
      setInput(name, false);
    }
  });

  function canvasPoint(e) {
    return {
      x: (e.clientX - ox) / scale,
      y: (e.clientY - oy) / scale
    };
  }
  canvas.addEventListener('pointerdown', e => {
    const p = canvasPoint(e);
    input.mouse.down = true;
    input.mouse.x = p.x;
    input.mouse.y = p.y;
    setInput('shoot', true);
    setInput('start', true);
    unlockAudio();
  });
  canvas.addEventListener('pointermove', e => {
    const p = canvasPoint(e);
    input.mouse.x = p.x;
    input.mouse.y = p.y;
  });
  window.addEventListener('pointerup', () => {
    input.mouse.down = false;
    setInput('shoot', false);
    setInput('start', false);
  });

  document.querySelectorAll('[data-input]').forEach(btn => {
    const name = btn.dataset.input;
    const on = e => {
      e.preventDefault();
      btn.classList.add('active');
      setInput(name, true);
      unlockAudio();
    };
    const off = e => {
      e.preventDefault();
      btn.classList.remove('active');
      setInput(name, false);
    };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('pointerleave', off);
  });

  let audioCtx = null;
  let muted = false;
  function unlockAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }
  function beep(freq = 440, dur = 0.05, type = 'square', vol = 0.045, slide = 1) {
    if (muted) return;
    unlockAudio();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(35, freq * slide), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  const weapons = [
    { id: 'rifle', name: 'RIFLE', color: '#fff3a5', cool: 0.13 },
    { id: 'spread', name: 'SPREAD', color: '#ffcf40', cool: 0.29 },
    { id: 'laser', name: 'LASER', color: '#63e7ff', cool: 0.22 },
    { id: 'flame', name: 'FLAME', color: '#ff7247', cool: 0.12 },
    { id: 'rocket', name: 'ROCKET', color: '#9bff66', cool: 0.42 }
  ];

  const LEVELS = [
    {
      name: 'JUNGLE RUN', subtitle: 'Operation Green Hell', decor: ['palm', 'fern'], boss: 'ALIEN FORTRESS', width: 9000, ground: 456, bossHp: 150,
      theme: { sky1: '#101e3c', sky2: '#224260', sky3: '#102315', hill1: '#15384a', hill2: '#0d332d', hill3: '#09241b', ground: '#2b1c11', groundTop: '#5b3a1d', platform: '#43311d', platformTop: '#8a5f2d', crate: '#92592a', crateLine: '#d59645', sun: 'rgba(255,235,170,.95)' },
      pits: [{ x: 920, w: 128 }, { x: 1780, w: 156 }, { x: 2850, w: 120 }, { x: 3970, w: 190 }, { x: 5380, w: 170 }, { x: 6960, w: 140 }],
      platforms: [[560,355,220], [980,330,230], [1390,292,250], [1875,350,280], [2420,305,260], [3090,368,240], [3510,285,280], [4090,335,330], [4820,305,250], [5445,346,310], [6120,296,285], [6680,356,260], [7180,318,280], [7720,274,270]],
      crates: [760, 1560, 2540, 3320, 4560, 6240, 7350],
      enemies: { grunts: [410, 690, 1260, 1510, 2220, 2730, 3190, 3710, 4330, 4990, 5850, 6460, 7060, 7620], turrets: [1120, 2050, 3560, 4500, 5640, 6810, 7870], drones: [1680, 3000, 3870, 5200, 6020, 7440], jumpers: [2460, 4690, 6330] }
    },
    {
      name: 'FROZEN RIDGE', subtitle: 'Cliffside Missile Base', decor: ['pine', 'crystal'], boss: 'MISSILE CRAWLER', width: 9800, ground: 448, bossHp: 190,
      theme: { sky1: '#071632', sky2: '#214a69', sky3: '#d7f6ff', hill1: '#18395a', hill2: '#2b6281', hill3: '#c7e9f2', ground: '#172332', groundTop: '#9fd4e8', platform: '#24384a', platformTop: '#b8f0ff', crate: '#44657a', crateLine: '#c4f4ff', sun: 'rgba(210,245,255,.92)' },
      pits: [{ x: 800, w: 210 }, { x: 1660, w: 130 }, { x: 2550, w: 250 }, { x: 3660, w: 150 }, { x: 4680, w: 270 }, { x: 6120, w: 180 }, { x: 7620, w: 260 }],
      platforms: [[430,330,200], [920,300,260], [1320,254,210], [1870,352,220], [2250,292,340], [2880,338,240], [3320,260,310], [3940,316,250], [4440,246,240], [5060,350,330], [5700,286,250], [6330,250,300], [7060,334,260], [7750,278,310], [8340,322,260]],
      crates: [520, 1440, 2370, 3440, 4310, 5360, 6500, 8100],
      enemies: { grunts: [360, 830, 1220, 1760, 2130, 2680, 3180, 3830, 4210, 4890, 5520, 6040, 6680, 7230, 8040, 8580], turrets: [1080, 1980, 3060, 4580, 5900, 7360, 8480], drones: [1500, 2470, 4090, 5220, 6310, 7900, 8800], jumpers: [2860, 4740, 6920, 8240] }
    },
    {
      name: 'ALIEN HIVE', subtitle: 'Heart of the Invasion', decor: ['crystal', 'pipe'], boss: 'HIVE QUEEN CORE', width: 10400, ground: 462, bossHp: 260,
      theme: { sky1: '#160622', sky2: '#42105f', sky3: '#100d20', hill1: '#281044', hill2: '#3b1457', hill3: '#1d0f2c', ground: '#251129', groundTop: '#a53fff', platform: '#321642', platformTop: '#ff53d7', crate: '#563169', crateLine: '#ff8af0', sun: 'rgba(255,91,213,.86)' },
      pits: [{ x: 720, w: 140 }, { x: 1380, w: 220 }, { x: 2350, w: 170 }, { x: 3360, w: 260 }, { x: 4550, w: 170 }, { x: 5520, w: 310 }, { x: 6820, w: 220 }, { x: 8420, w: 290 }],
      platforms: [[360,340,220], [900,286,250], [1640,332,240], [2050,258,310], [2650,352,240], [3150,282,260], [3780,322,330], [4280,246,220], [4960,338,280], [5900,276,360], [6540,334,260], [7240,258,300], [7900,336,290], [8720,290,300], [9300,250,260]],
      crates: [460, 1160, 2100, 3020, 3880, 5020, 6260, 7520, 9020],
      enemies: { grunts: [340, 760, 1160, 1760, 2260, 2760, 3260, 3820, 4380, 4920, 5480, 6120, 6760, 7380, 8060, 8840, 9440], turrets: [980, 1880, 2920, 4140, 5180, 6400, 7680, 9120], drones: [1320, 2440, 3520, 4620, 5760, 7060, 8340, 9540], jumpers: [1960, 3680, 5300, 6960, 8600, 9420] }
    }
  ];

  const level = {
    width: 9000,
    ground: 456,
    name: '',
    subtitle: '',
    bossName: '',
    theme: LEVELS[0].theme,
    decorKinds: LEVELS[0].decor,
    pits: [],
    platforms: [],
    crates: [],
    decorations: [],
    props: []
  };

  let state = 'title';
  let stateTime = 0;
  let camera = { x: 0, y: 0, shake: 0 };
  let player, enemies, bullets, enemyBullets, particles, powerups, floatText, boss;
  let score = 0;
  let combo = 0;
  let comboTimer = 0;
  let runTime = 0;
  let levelIndex = 0;

  function currentLevel() {
    return LEVELS[levelIndex] || LEVELS[0];
  }

  function buildLevel() {
    const cfg = currentLevel();
    level.width = cfg.width;
    level.ground = cfg.ground;
    level.name = cfg.name;
    level.subtitle = cfg.subtitle;
    level.bossName = cfg.boss;
    level.theme = cfg.theme;
    level.decorKinds = cfg.decor;
    // Shrink old arcade-death pits and build around them with bridges/catwalks.
    level.pits = cfg.pits.map(p => {
      const w = Math.max(70, Math.floor(p.w * 0.58));
      return { x: p.x + Math.floor((p.w - w) / 2), w };
    });
    level.platforms = cfg.platforms.map(([x, y, w]) => ({ x, y, w, h: 22, kind: 'solid' }));
    for (const p of level.pits) {
      level.platforms.push({ x: p.x - 54, y: level.ground - rand(92, 142), w: p.w + 108, h: 18, kind: 'bridge' });
      if (Math.random() < 0.6) level.platforms.push({ x: p.x + p.w + 76, y: level.ground - rand(154, 210), w: rand(120, 190), h: 18, kind: 'catwalk' });
    }
    for (let x = 360; x < level.width - 900; x += rand(380, 620)) {
      level.platforms.push({ x, y: rand(238, 385), w: rand(120, 230), h: 18, kind: Math.random() < 0.45 ? 'catwalk' : 'solid' });
    }
    level.platforms.sort((a, b) => a.x - b.x);
    level.crates = cfg.crates.map(x => ({ x, y: level.ground - 42, w: 42, h: 42, hp: 3 + levelIndex }));
    for (let x = 520; x < level.width - 800; x += rand(520, 780)) {
      level.crates.push({ x, y: level.ground - 42, w: 42, h: 42, hp: 3 + levelIndex });
    }
    level.decorations = [];
    level.props = [];
    for (let x = 80; x < level.width - 300; x += rand(95, 220)) {
      const kind = level.decorKinds[Math.floor(Math.random() * level.decorKinds.length)];
      level.decorations.push({ x, kind, h: rand(45, 120), sway: rand(0, Math.PI * 2) });
    }
    for (let x = 280; x < level.width - 700; x += rand(360, 620)) {
      const kinds = levelIndex === 0 ? ['bunker', 'waterfall', 'antenna', 'ruin'] : levelIndex === 1 ? ['radar', 'tower', 'icefall', 'antenna'] : ['hivepod', 'ribcage', 'vent', 'obelisk'];
      level.props.push({ x, kind: kinds[Math.floor(Math.random() * kinds.length)], h: rand(75, 170), w: rand(70, 150), y: level.ground, phase: rand(0, Math.PI * 2) });
    }
  }

  function resetGame(keepProgress = false) {
    if (!keepProgress) {
      levelIndex = 0;
      score = 0;
      runTime = 0;
    }
    const carry = keepProgress && player ? {
      lives: Math.max(1, player.lives), hp: Math.max(player.hp, Math.ceil(player.maxHp * 0.65)), maxHp: player.maxHp,
      energy: player.maxEnergy, maxEnergy: player.maxEnergy, weapon: player.weapon, unlocked: new Set(player.unlocked),
      drones: Array.isArray(player.drones) ? player.drones.map(d => ({ ...d })) : [], shield: player.shield, boots: player.boots, overdrive: player.overdrive, magnet: player.magnet
    } : null;
    buildLevel();
    player = {
      x: 76, y: level.ground - 58, w: 29, h: 54,
      vx: 0, vy: 0, facing: 1, onGround: false, crouch: false,
      hp: carry ? Math.min(carry.maxHp, carry.hp + 2) : 8, maxHp: carry ? carry.maxHp : 8,
      lives: carry ? carry.lives : 3, invuln: 2.0, fireTimer: 0, secondaryTimer: 0,
      energy: carry ? carry.energy : 100, maxEnergy: carry ? carry.maxEnergy : 100,
      weapon: carry ? carry.weapon : 'rifle', unlocked: carry ? carry.unlocked : new Set(['rifle']), shield: carry ? carry.shield : 0,
      drones: carry ? carry.drones : [], droneTimer: 0, boots: carry ? carry.boots : 0, overdrive: carry ? carry.overdrive : 0, magnet: carry ? carry.magnet : 0,
      jumpBuffer: 0, coyote: 0, doubleJump: false, respawn: 0, dead: false
    };
    enemies = [];
    bullets = [];
    enemyBullets = [];
    particles = [];
    powerups = [];
    floatText = [];
    const cfg = currentLevel();
    const bx = level.width - 650;
    boss = {
      x: bx, y: levelIndex === 2 ? 176 : 206, w: 360, h: levelIndex === 2 ? 280 : 250, hp: Math.floor(cfg.bossHp * (1.25 + levelIndex * 0.18)), maxHp: Math.floor(cfg.bossHp * (1.25 + levelIndex * 0.18)),
      active: false, dead: false, phase: 0, timer: 0, spawnTimer: 2.5,
      guns: [
        { x: bx + 74, y: levelIndex === 2 ? 318 : 320, w: 52, h: 45, hp: 25 + levelIndex * 8, cd: 0.6 },
        { x: bx + 250, y: levelIndex === 2 ? 252 : 270, w: 52, h: 45, hp: 25 + levelIndex * 8, cd: 1.0 }
      ]
    };
    spawnEnemies();
    combo = 0;
    comboTimer = 0;
    camera.x = 0;
    camera.shake = 0;
    state = 'playing';
    stateTime = 0;
    addText('LEVEL ' + (levelIndex + 1) + ': ' + level.name, 160, 94, '#ffcf40');
  }

  function nextLevel() {
    if (levelIndex < LEVELS.length - 1) {
      levelIndex += 1;
      resetGame(true);
    } else {
      state = 'victory';
      stateTime = 0;
    }
  }

  function spawnEnemies() {
    const cfg = currentLevel().enemies;
    const add = (type, x, y) => enemies.push(makeEnemy(type, x, y));
    cfg.grunts.forEach((x, i) => add(i % 3 === 0 ? 'runner' : 'grunt', x));
    cfg.turrets.forEach(x => add('turret', x));
    cfg.drones.forEach(x => add('drone', x, rand(levelIndex === 2 ? 105 : 145, levelIndex === 2 ? 245 : 270)));
    cfg.jumpers.forEach(x => add('jumper', x));
    for (let i = 5; i < level.platforms.length; i += 4) {
      const p = level.platforms[i];
      if (p.x > 650 && p.x < level.width - 900) add('sniper', p.x + p.w * 0.55, p.y - 42);
    }
    for (let x = 1250 + levelIndex * 180; x < level.width - 1200; x += 1150) add('heavy', x);
  }

  function makeEnemy(type, x, y) {
    const base = { type, x, y: y || level.ground - 48, w: 34, h: 48, vx: 0, vy: 0, hp: 3, maxHp: 3, cd: rand(0.4, 1.8), dir: -1, alive: true, hit: 0, anchor: x, t: rand(0, 10), score: 100 };
    if (type === 'runner') Object.assign(base, { hp: 4, maxHp: 4, w: 32, h: 44, score: 140 });
    if (type === 'turret') Object.assign(base, { y: level.ground - 38, w: 42, h: 38, hp: 6, maxHp: 6, score: 180 });
    if (type === 'drone') Object.assign(base, { w: 42, h: 28, hp: 3, maxHp: 3, baseY: y || 190, score: 160 });
    if (type === 'jumper') Object.assign(base, { hp: 5, maxHp: 5, w: 35, h: 48, score: 220 });
    if (type === 'sniper') Object.assign(base, { y: y || level.ground - 92, w: 30, h: 42, hp: 6, maxHp: 6, score: 300, cd: rand(0.2, 1.0) });
    if (type === 'heavy') Object.assign(base, { y: level.ground - 58, w: 48, h: 58, hp: 13, maxHp: 13, score: 480, cd: rand(0.8, 1.4) });
    if (levelIndex > 0) {
      base.hp += levelIndex;
      base.maxHp += levelIndex;
      base.score += levelIndex * 60;
    }
    return base;
  }

  function weaponInfo(id = player.weapon) {
    return weapons.find(w => w.id === id) || weapons[0];
  }

  function startExplosion(x, y, color = '#ffcf40', amount = 18, power = 1) {
    for (let i = 0; i < amount; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(60, 360) * power;
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        r: rand(2, 6) * power, life: rand(0.25, 0.8), max: 0, color
      });
      particles[particles.length - 1].max = particles[particles.length - 1].life;
    }
    // Keep impact feedback readable. Full random screen quake was too harsh,
    // especially with rockets/lasers; reserve big shake for scripted events.
    camera.shake = Math.max(camera.shake, Math.min(3.2, 2.2 * power));
  }

  function addText(text, x, y, color = '#fff') {
    floatText.push({ text, x, y, vy: -42, life: 0.8, color });
  }

  function isPitAt(x) {
    return level.pits.some(p => x > p.x && x < p.x + p.w);
  }

  function groundExistsUnder(rect) {
    const left = rect.x + 6;
    const right = rect.x + rect.w - 6;
    return !isPitAt(left) || !isPitAt(right) || !isPitAt(rect.x + rect.w / 2);
  }

  function damagePlayer(dmg, fromX) {
    if (cheats.god) { player.dead = false; player.hp = player.maxHp; player.shield = Math.max(player.shield, 999); return; }
    if (player.invuln > 0 || player.dead) return;
    if (player.shield > 0) {
      player.shield = Math.max(0, player.shield - dmg * 0.6);
      startExplosion(player.x + player.w / 2, player.y + 24, '#63e7ff', 8, 0.6);
      beep(520, 0.05, 'sine', 0.035, 1.4);
      return;
    }
    player.hp -= dmg;
    player.invuln = 1.15;
    player.vx += fromX < player.x ? 220 : -220;
    player.vy = -260;
    beep(110, 0.16, 'sawtooth', 0.07, 0.5);
    addText('-' + dmg, player.x + 12, player.y, '#ff5d5d');
    camera.shake = 9;
    if (player.hp <= 0) killPlayer();
  }

  function killPlayer() {
    if (cheats.god) { player.dead = false; player.hp = player.maxHp; player.lives = Math.max(player.lives, 3); player.invuln = 999; return; }
    if (player.dead) return;
    player.dead = true;
    player.lives -= 1;
    player.respawn = 1.6;
    startExplosion(player.x + player.w / 2, player.y + player.h / 2, '#ff4848', 32, 1.25);
    beep(80, 0.45, 'sawtooth', 0.09, 0.25);
  }

  function respawnPlayer() {
    if (player.lives < 0) {
      if (cheats.god) player.lives = 3;
      else {
        state = 'gameover';
        stateTime = 0;
        return;
      }
    }
    player.dead = false;
    player.hp = player.maxHp;
    player.invuln = 2.2;
    player.vx = player.vy = 0;
    player.x = Math.max(70, camera.x + 70);
    player.y = level.ground - player.h - 6;
    if (isPitAt(player.x)) player.x += 180;
  }

  function powerupInfo(kind) {
    const weapon = weapons.find(w => w.id === kind);
    if (weapon) return { name: weapon.name, label: weapon.name, color: weapon.color, icon: 'weapon' };
    return {
      heal: { name: 'MED KIT', label: 'MED KIT', color: '#78ff7d', icon: 'heal' },
      shield: { name: 'SHIELD', label: 'SHIELD', color: '#63e7ff', icon: 'shield' },
      dronepod: { name: 'DRONE POD', label: 'DRONE POD', color: '#77f7ff', icon: 'drone' },
      overdrive: { name: 'OVERDRIVE', label: 'OVERDRIVE', color: '#ff4dff', icon: 'bolt' },
      boots: { name: 'MOON BOOTS', label: 'MOON BOOTS', color: '#b9ff56', icon: 'boots' },
      magnet: { name: 'MAGNET', label: 'MAGNET', color: '#b16cff', icon: 'magnet' },
      nova: { name: 'NOVA BOMB', label: 'NOVA BOMB', color: '#ff9d2e', icon: 'nova' }
    }[kind] || { name: 'POWER', label: 'POWER', color: '#fff', icon: 'power' };
  }

  const DRONE_TYPES = [
    { type: 'laser', name: 'Laser Drone', color: '#77f7ff' },
    { type: 'striker', name: 'Striker Drone', color: '#ffcf40' },
    { type: 'shield', name: 'Shield Drone', color: '#63e7ff' },
    { type: 'blaster', name: 'Blaster Drone', color: '#ff7cff' },
    { type: 'repair', name: 'Repair Drone', color: '#78ff7d' }
  ];
  function droneCount() {
    return Array.isArray(player?.drones) ? player.drones.length : 0;
  }
  function addDrone(type) {
    if (!player) return null;
    if (!Array.isArray(player.drones)) player.drones = [];
    const info = type ? DRONE_TYPES.find(d => d.type === type) || DRONE_TYPES[0] : DRONE_TYPES[player.drones.length % DRONE_TYPES.length];
    const d = { type: info.type, name: info.name, color: info.color, cd: rand(0, 0.5), phase: rand(0, Math.PI * 2), dash: 0 };
    player.drones.push(d);
    return d;
  }
  function dronePos(i, total, d) {
    const ring = Math.floor(i / 8);
    const a = runTime * (d.type === 'striker' ? 3.4 : 2.2) + i * Math.PI * 2 / Math.max(1, Math.min(total, 8)) + d.phase;
    const ahead = d.type === 'striker' ? 58 * player.facing + Math.sin(runTime * 3 + d.phase) * 22 : 0;
    return {
      x: player.x + player.w / 2 + ahead + Math.cos(a) * (48 + ring * 18),
      y: player.y + 18 + Math.sin(a) * (24 + ring * 8) - ring * 5
    };
  }

  function grantPowerup(kind, x, y) {
    if (kind === 'heal') {
      player.hp = Math.min(player.maxHp, player.hp + 4);
      addText('HEAL', x, y, '#78ff7d');
      beep(720, 0.11, 'triangle', 0.05, 1.5);
      return;
    }
    if (kind === 'shield') {
      player.shield = Math.min(12, player.shield + 6);
      addText('SHIELD', x, y, '#63e7ff');
      beep(620, 0.14, 'sine', 0.05, 1.8);
      return;
    }
    if (kind === 'dronepod') {
      const d = addDrone();
      addText(d.name.toUpperCase() + ' #' + droneCount(), x, y, d.color);
      beep(900, 0.14, 'sine', 0.055, 1.6);
      return;
    }
    if (kind === 'overdrive') {
      player.overdrive = Math.max(player.overdrive, 12);
      player.energy = player.maxEnergy;
      addText('OVERDRIVE', x, y, '#ff4dff');
      beep(980, 0.18, 'square', 0.055, 1.9);
      return;
    }
    if (kind === 'boots') {
      player.boots = Math.max(player.boots, 24);
      addText('MOON BOOTS', x, y, '#b9ff56');
      beep(540, 0.15, 'triangle', 0.05, 1.8);
      return;
    }
    if (kind === 'magnet') {
      player.magnet = Math.max(player.magnet, 18);
      addText('POWER MAGNET', x, y, '#b16cff');
      beep(460, 0.14, 'sine', 0.05, 1.6);
      return;
    }
    if (kind === 'nova') {
      addText('NOVA!', x, y, '#ff9d2e');
      rocketBlast(player.x + player.w / 2, player.y + player.h / 2);
      for (const e of enemies) if (e.alive && e.x > camera.x - 50 && e.x < camera.x + VIEW_W + 50) hurtEnemy(e, 6, e.x + e.w / 2, e.y + e.h / 2);
      if (boss.active && !boss.dead) hurtBoss(15, boss.x + boss.w / 2, boss.y + boss.h / 2);
      camera.shake = 20;
      return;
    }
    player.unlocked.add(kind);
    player.weapon = kind;
    const info = powerupInfo(kind);
    addText(info.name + '!', x, y, info.color);
    beep(860, 0.14, 'square', 0.055, 1.8);
  }

  function maybeDrop(x, y) {
    const r = Math.random();
    if (r > 0.42) return;
    const choices = ['spread', 'laser', 'flame', 'rocket', 'heal', 'shield', 'dronepod', 'overdrive', 'boots', 'magnet', 'nova'];
    const kind = choices[Math.floor(Math.random() * choices.length)];
    powerups.push({ kind, x: x - 12, y: y - 18, w: 28, h: 28, vy: -240, life: 14, t: 0 });
  }

  function cycleWeapon() {
    const unlocked = weapons.filter(w => player.unlocked.has(w.id));
    if (unlocked.length <= 1) return;
    let i = unlocked.findIndex(w => w.id === player.weapon);
    player.weapon = unlocked[(i + 1) % unlocked.length].id;
    addText(weaponInfo().name, player.x, player.y - 18, weaponInfo().color);
    beep(350, 0.05, 'triangle', 0.035, 1.25);
  }

  function aimVector() {
    if (input.mouse.down) {
      const px = input.mouse.x + camera.x;
      const py = input.mouse.y;
      const cx = player.x + player.w / 2;
      const cy = player.y + (player.crouch ? 30 : 20);
      const dx = px - cx;
      const dy = py - cy;
      const len = Math.hypot(dx, dy) || 1;
      player.facing = dx >= 0 ? 1 : -1;
      return { x: dx / len, y: dy / len };
    }
    let ax = 0;
    let ay = 0;
    if (input.up) ay -= 1;
    if (input.down && !player.onGround) ay += 1;
    if (input.left) ax -= 1;
    if (input.right) ax += 1;
    if (!ax && !ay) ax = player.facing;
    if (ay && !ax && player.onGround) ax = 0;
    if (ay && ax) {
      ax *= 0.72;
      ay *= 0.72;
    }
    if (!ay && !ax) ax = player.facing;
    const len = Math.hypot(ax, ay) || 1;
    return { x: ax / len, y: ay / len };
  }

  function shootPlayer() {
    if (player.dead || player.fireTimer > 0) return;
    const w = weaponInfo();
    const boosted = player.overdrive > 0 || cheats.hyper;
    player.fireTimer = w.cool * (boosted ? 0.48 : 1);
    const aim = aimVector();
    const sx = player.x + player.w / 2 + aim.x * 24;
    const sy = player.y + (player.crouch ? 32 : 21) + aim.y * 10;
    const make = (ang, speed, extra = {}) => {
      bullets.push(Object.assign({
        x: sx, y: sy, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        r: 4, damage: 1, ttl: 1.25, color: cheats.party ? `hsl(${Math.floor(runTime * 260 + rand(0, 120)) % 360} 100% 65%)` : w.color, pierce: 0, type: w.id
      }, extra));
      const shot = bullets[bullets.length - 1];
      if (boosted) shot.damage += shot.type === 'spread' ? 0.5 : 1;
      particles.push({ x: sx + Math.cos(ang) * 8, y: sy + Math.sin(ang) * 8, vx: Math.cos(ang) * 90, vy: Math.sin(ang) * 90, r: w.id === 'rocket' ? 8 : 4, life: 0.08, max: 0.08, color: w.color });
    };
    const a = Math.atan2(aim.y, aim.x);
    if (w.id === 'rifle') make(a, 720, { r: 4, damage: 1, ttl: 1.15 });
    if (w.id === 'spread') {
      for (let i = -2; i <= 2; i++) make(a + i * 0.17, 650, { r: 3.5, damage: 1, ttl: 0.82 });
    }
    if (w.id === 'laser') make(a, 930, { r: 5, damage: 2, ttl: 0.72, pierce: 4 });
    if (w.id === 'flame') {
      make(a + rand(-0.09, 0.09), 450, { r: 8, damage: 1, ttl: 0.55, gravity: -220, pierce: 2 });
      if (Math.random() < 0.45) make(a + rand(-0.2, 0.2), 385, { r: 6, damage: 1, ttl: 0.42, gravity: -180, pierce: 1 });
    }
    if (w.id === 'rocket') make(a, 500, { r: 7, damage: 4, ttl: 1.35, explosive: true, smoke: 0 });
    // Weapon firing gets muzzle flash/recoil feel from particles/audio only;
    // don't shake the whole screen on every shot.
    camera.shake = Math.max(camera.shake, w.id === 'rocket' ? 0.8 : w.id === 'laser' ? 0.35 : 0.15);
    beep(w.id === 'rocket' ? 130 : w.id === 'laser' ? 780 : 410, w.id === 'rocket' ? 0.13 : 0.035, w.id === 'laser' ? 'sine' : 'square', 0.04, w.id === 'laser' ? 1.8 : 0.72);
  }

  function shootSecondary() {
    if (player.dead || player.secondaryTimer > 0 || player.energy < 24) return;
    const aim = aimVector();
    const sx = player.x + player.w / 2 + aim.x * 18;
    const sy = player.y + 20 + aim.y * 10;
    const speed = cheats.hyper || player.overdrive > 0 ? 560 : 430;
    player.energy -= 24;
    player.secondaryTimer = cheats.hyper ? 0.18 : 0.55;
    bullets.push({
      x: sx, y: sy, vx: aim.x * speed, vy: aim.y * speed - 35,
      r: 11, damage: 5, ttl: 1.45, color: '#b16cff', pierce: 1,
      type: 'ion', explosive: true, smoke: 0
    });
    beep(150, 0.16, 'sawtooth', 0.06, 0.45);
  }

  function nearestTarget(x, y, range = 520) {
    let best = null;
    let bestD = range;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x + e.w / 2 - x, e.y + e.h / 2 - y);
      if (d < bestD) { best = { x: e.x + e.w / 2, y: e.y + e.h / 2, enemy: e }; bestD = d; }
    }
    if (boss.active && !boss.dead) {
      const bx = boss.x + boss.w * 0.42, by = boss.y + boss.h * 0.48;
      const d = Math.hypot(bx - x, by - y);
      if (d < bestD) best = { x: bx, y: by, boss };
    }
    return best;
  }

  function updateDrones(dt) {
    if (!Array.isArray(player.drones) || !player.drones.length || player.dead) return;
    const total = player.drones.length;
    for (let i = 0; i < total; i++) {
      const d = player.drones[i];
      const pos = dronePos(i, total, d);
      d.cd -= dt;

      if (d.type === 'shield') {
        player.shield = Math.max(player.shield, 2.5);
        for (const b of enemyBullets) {
          if (b.ttl > 0 && Math.hypot(b.x - pos.x, b.y - pos.y) < 45) {
            b.ttl = -1;
            startExplosion(b.x, b.y, d.color, 5, 0.35);
            d.cd = Math.max(d.cd, 0.08);
          }
        }
        continue;
      }

      if (d.type === 'repair') {
        if (d.cd <= 0 && player.hp < player.maxHp) {
          player.hp = Math.min(player.maxHp, player.hp + 1);
          addText('+', player.x + player.w / 2, player.y - 8, d.color);
          d.cd = 5.0;
        }
        continue;
      }

      if (d.cd > 0) continue;
      const range = d.type === 'striker' ? 820 : d.type === 'blaster' ? 680 : 620;
      const target = nearestTarget(pos.x, pos.y, range);
      if (!target) continue;
      const ang = Math.atan2(target.y - pos.y, target.x - pos.x);
      if (d.type === 'laser') {
        bullets.push({ x: pos.x, y: pos.y, vx: Math.cos(ang) * 900, vy: Math.sin(ang) * 900, r: 4, damage: 1, ttl: 0.55, color: d.color, pierce: 2, type: 'laser' });
        d.cd = player.overdrive > 0 || cheats.hyper ? 0.25 : 0.42;
      } else if (d.type === 'striker') {
        bullets.push({ x: pos.x, y: pos.y, vx: Math.cos(ang) * 620, vy: Math.sin(ang) * 620, r: 6, damage: 3, ttl: 1.0, color: d.color, pierce: 0, type: 'rocket', explosive: true, smoke: 0 });
        d.cd = player.overdrive > 0 || cheats.hyper ? 0.75 : 1.25;
      } else if (d.type === 'blaster') {
        bullets.push({ x: pos.x, y: pos.y, vx: Math.cos(ang) * 520, vy: Math.sin(ang) * 520, r: 10, damage: 4, ttl: 1.05, color: d.color, pierce: 1, type: 'ion', explosive: true, smoke: 0 });
        d.cd = player.overdrive > 0 || cheats.hyper ? 1.1 : 1.9;
      }
      if (i === 0) beep(d.type === 'blaster' ? 220 : 1050, 0.025, d.type === 'laser' ? 'sine' : 'square', 0.018, 1.25);
    }
    enemyBullets = enemyBullets.filter(b => b.ttl > 0);
  }

  function enemyShoot(e, speed = 260, spread = 0) {
    const ex = e.x + e.w / 2;
    const ey = e.y + e.h / 2;
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    let a = Math.atan2(py - ey, px - ex) + rand(-spread, spread);
    enemyBullets.push({ x: ex, y: ey, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 5, damage: 1, ttl: 3, color: '#ff4d63' });
    beep(190, 0.035, 'square', 0.018, 0.8);
  }

  function updatePlayer(dt) {
    if (cheats.god) {
      player.dead = false;
      player.hp = player.maxHp;
      player.lives = Math.max(player.lives, 3);
      player.shield = Math.max(player.shield, 999);
      player.invuln = Math.max(player.invuln, 999);
    }
    if (player.dead) {
      player.respawn -= dt;
      if (player.respawn <= 0) respawnPlayer();
      return;
    }
    if (consume('switch')) cycleWeapon();
    if (input.secondary) shootSecondary();
    if (consume('jump')) player.jumpBuffer = 0.22;
    player.jumpBuffer -= dt;
    player.fireTimer = Math.max(0, player.fireTimer - dt);
    player.secondaryTimer = Math.max(0, player.secondaryTimer - dt);
    player.energy = Math.min(player.maxEnergy, player.energy + dt * (player.overdrive > 0 || cheats.hyper ? 34 : 18));
    player.invuln = cheats.god ? 999 : Math.max(0, player.invuln - dt);
    player.shield = cheats.god ? 999 : Math.max(0, player.shield - dt * 0.08);
    player.boots = Math.max(0, player.boots - dt);
    player.overdrive = Math.max(0, player.overdrive - dt);
    player.magnet = Math.max(0, player.magnet - dt);

    const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (move) player.facing = move;
    player.crouch = input.down && player.onGround;
    const boostedMove = player.boots > 0 || cheats.hyper;
    const speed = player.crouch ? 120 : boostedMove ? 350 : 290;
    const targetVx = move * speed;
    player.vx = lerp(player.vx, targetVx, player.onGround ? 0.36 : 0.19);
    if (!player.onGround) player.vx = clamp(player.vx, -430, 430);

    player.coyote -= dt;
    if (player.onGround) {
      player.coyote = 0.16;
      player.doubleJump = player.boots > 0;
    }
    if (player.jumpBuffer > 0 && !player.crouch && (player.coyote > 0 || player.doubleJump)) {
      const moon = player.boots > 0 || cheats.hyper;
      player.vy = moon ? -860 : -760;
      player.onGround = false;
      if (player.coyote <= 0) player.doubleJump = false;
      player.coyote = 0;
      player.jumpBuffer = 0;
      beep(moon ? 340 : 260, 0.06, 'triangle', 0.04, 1.45);
    }
    if (!input.jump && player.vy < -165) player.vy += 760 * dt;

    if (input.shoot || input.mouse.down) shootPlayer();

    const wasOnGround = player.onGround;
    const oldY = player.y;
    player.vy += GRAVITY * dt;
    player.x += player.vx * dt;
    player.x = clamp(player.x, 15, level.width - 180);
    player.y += player.vy * dt;
    player.onGround = false;

    const feet = { x: player.x, y: player.y, w: player.w, h: player.h };
    if (player.vy >= 0) {
      for (const p of level.platforms) {
        if (oldY + player.h <= p.y + 8 && player.y + player.h >= p.y && player.x + player.w > p.x + 5 && player.x < p.x + p.w - 5) {
          player.y = p.y - player.h;
          player.vy = 0;
          player.onGround = true;
        }
      }
      if (!player.onGround && groundExistsUnder(feet) && oldY + player.h <= level.ground + 8 && player.y + player.h >= level.ground) {
        player.y = level.ground - player.h;
        player.vy = 0;
        player.onGround = true;
      }
    }

    if (!wasOnGround && player.onGround && player.vy === 0) {
      for (let i = 0; i < 8; i++) particles.push({ x: player.x + player.w / 2 + rand(-12, 12), y: player.y + player.h - 3, vx: rand(-85, 85), vy: rand(-70, -15), r: rand(2, 5), life: rand(0.18, 0.38), max: 0.38, color: level.theme.groundTop });
      camera.shake = Math.max(camera.shake, 2.5);
    }

    for (const crate of level.crates) {
      if (crate.hp > 0 && rectsOverlap(player, crate)) {
        if (player.x + player.w / 2 < crate.x + crate.w / 2) player.x = crate.x - player.w;
        else player.x = crate.x + crate.w;
      }
    }

    if (player.y > VIEW_H + 220) {
      if (cheats.god) {
        player.y = level.ground - player.h - 20;
        player.vy = -420;
        player.dead = false;
      } else killPlayer();
    }

    const ideal = clamp(player.x - VIEW_W * 0.38, 0, level.width - VIEW_W);
    camera.x = lerp(camera.x, ideal, 1 - Math.pow(0.0008, dt));
    camera.shake = Math.max(0, camera.shake - dt * 18);
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      if (!e.alive) continue;
      if (e.x < camera.x - 220 || e.x > camera.x + VIEW_W + 320) continue;
      e.t += dt;
      e.hit = Math.max(0, e.hit - dt);
      const dx = player.x - e.x;
      const dist = Math.abs(dx);
      e.dir = dx < 0 ? -1 : 1;
      e.cd -= dt;
      if (e.type === 'grunt') {
        e.vx = Math.sin(e.t * 1.5) * 35 + e.dir * (dist < 260 ? 28 : 0);
        e.x += e.vx * dt;
        if (e.cd <= 0 && dist < 560) { enemyShoot(e, 270, 0.06); e.cd = rand(1.25, 2.25); }
      } else if (e.type === 'runner') {
        e.vx = e.dir * (dist < 420 ? 145 : 70);
        e.x += e.vx * dt;
        if (rectsOverlap(e, player)) damagePlayer(1, e.x);
        if (e.cd <= 0 && dist < 360) { enemyShoot(e, 240, 0.22); e.cd = rand(1.8, 2.7); }
      } else if (e.type === 'jumper') {
        e.vy += GRAVITY * dt;
        e.x += e.dir * (dist < 520 ? 78 : 28) * dt;
        e.y += e.vy * dt;
        if (e.y + e.h >= level.ground && groundExistsUnder(e)) {
          e.y = level.ground - e.h;
          e.vy = (dist < 450 && Math.random() < 0.035) ? -610 : 0;
        }
        if (e.cd <= 0 && dist < 520) { enemyShoot(e, 300, 0.12); e.cd = rand(1.25, 2.1); }
      } else if (e.type === 'turret') {
        if (e.cd <= 0 && dist < 700) { enemyShoot(e, 315, 0.04); e.cd = rand(0.9, 1.5); }
      } else if (e.type === 'sniper') {
        if (e.cd <= 0 && dist < 820) { enemyShoot(e, 430, 0.015); e.cd = rand(1.05, 1.7); }
      } else if (e.type === 'heavy') {
        e.vx = e.dir * (dist < 500 ? 52 : 18);
        e.x += e.vx * dt;
        if (e.cd <= 0 && dist < 620) {
          enemyShoot(e, 250, 0.16);
          enemyShoot({ x: e.x, y: e.y + 16, w: e.w, h: e.h }, 285, 0.1);
          e.cd = rand(1.4, 2.1);
        }
        if (rectsOverlap(e, player)) damagePlayer(2, e.x);
      } else if (e.type === 'drone') {
        e.x += Math.sin(e.t * 1.8) * 28 * dt + e.dir * (dist < 420 ? 18 : 0) * dt;
        e.y = e.baseY + Math.sin(e.t * 3.2) * 28;
        if (e.cd <= 0 && dist < 620) { enemyShoot(e, 250, 0.1); e.cd = rand(1.0, 1.8); }
      }
      if (e.type !== 'drone' && e.type !== 'jumper' && e.type !== 'sniper') e.y = level.ground - e.h;
      if (rectsOverlap(e, player)) damagePlayer(1, e.x);
    }
  }

  function hurtEnemy(e, damage, bx, by) {
    e.hp -= damage;
    e.hit = 0.08;
    addText(String(damage), e.x + e.w / 2, e.y, '#ffe96b');
    for (let i = 0; i < 4; i++) particles.push({ x: bx, y: by, vx: rand(-90, 90), vy: rand(-120, 20), r: rand(1.5, 3), life: 0.25, max: 0.25, color: '#ffe96b' });
    if (e.hp <= 0) {
      e.alive = false;
      score += e.score * Math.max(1, combo);
      combo += 1;
      comboTimer = 2.2;
      startExplosion(e.x + e.w / 2, e.y + e.h / 2, e.type === 'drone' ? '#a7efff' : '#ffbd4a', 16, 0.85);
      maybeDrop(e.x + e.w / 2, e.y + e.h / 2);
      beep(150, 0.12, 'sawtooth', 0.045, 0.45);
    }
  }

  function rocketBlast(x, y) {
    startExplosion(x, y, '#ff8b2f', 28, 1.1);
    for (const e of enemies) if (e.alive && Math.hypot(e.x + e.w / 2 - x, e.y + e.h / 2 - y) < 96) hurtEnemy(e, 3, x, y);
    if (boss.active && !boss.dead && x > boss.x - 100 && x < boss.x + boss.w + 100 && y > boss.y - 100 && y < boss.y + boss.h + 100) hurtBoss(5, x, y);
  }

  function updateBullets(dt) {
    for (const b of bullets) {
      b.ttl -= dt;
      if (b.gravity) b.vy += b.gravity * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.type === 'flame') b.r += 22 * dt;
      if (b.explosive) {
        b.smoke -= dt;
        if (b.smoke <= 0) {
          b.smoke = 0.035;
          particles.push({ x: b.x, y: b.y, vx: rand(-30, 30), vy: rand(-30, 30), r: rand(3, 7), life: 0.35, max: 0.35, color: '#777b86' });
        }
      }
      for (const crate of level.crates) {
        if (crate.hp > 0 && circleRect(b, crate)) {
          crate.hp -= b.damage;
          b.ttl = b.pierce > 0 ? b.ttl : -1;
          b.pierce--;
          startExplosion(b.x, b.y, '#d8934d', 7, 0.45);
          if (crate.hp <= 0) { score += 35; maybeDrop(crate.x + 20, crate.y + 10); }
          if (b.explosive) rocketBlast(b.x, b.y);
        }
      }
      for (const e of enemies) {
        if (e.alive && circleRect(b, e)) {
          hurtEnemy(e, b.damage, b.x, b.y);
          if (b.explosive) rocketBlast(b.x, b.y);
          if (b.pierce > 0) b.pierce -= 1;
          else b.ttl = -1;
          break;
        }
      }
      if (boss.active && !boss.dead && b.ttl > 0 && circleRect(b, boss)) {
        hurtBoss(b.damage, b.x, b.y);
        if (b.explosive) rocketBlast(b.x, b.y);
        if (b.pierce > 0) b.pierce -= 1;
        else b.ttl = -1;
      }
      if (b.y < -80 || b.y > VIEW_H + 90 || b.x < camera.x - 150 || b.x > camera.x + VIEW_W + 160) b.ttl = -1;
    }
    bullets = bullets.filter(b => b.ttl > 0);

    for (const b of enemyBullets) {
      b.ttl -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (!player.dead && circleRect(b, player)) {
        b.ttl = -1;
        damagePlayer(b.damage, b.x);
      }
      if (b.y < -80 || b.y > VIEW_H + 90 || b.x < camera.x - 180 || b.x > camera.x + VIEW_W + 180) b.ttl = -1;
    }
    enemyBullets = enemyBullets.filter(b => b.ttl > 0);
  }

  function hurtBoss(damage, x, y) {
    if (!boss.active || boss.dead) return;
    boss.hp -= damage;
    boss.phase = boss.hp < boss.maxHp * 0.45 ? 2 : boss.hp < boss.maxHp * 0.75 ? 1 : 0;
    addText(String(damage), x, y - 10, '#ff5252');
    for (const g of boss.guns) {
      if (g.hp > 0 && x > g.x && x < g.x + g.w && y > g.y && y < g.y + g.h) g.hp -= damage;
    }
    camera.shake = Math.max(camera.shake, 4);
    if (boss.hp <= 0) {
      boss.dead = true;
      score += 10000 + levelIndex * 5000;
      state = levelIndex < LEVELS.length - 1 ? 'levelclear' : 'victory';
      stateTime = 0;
      for (let i = 0; i < 11; i++) setTimeout(() => startExplosion(rand(boss.x, boss.x + boss.w), rand(boss.y, boss.y + boss.h), i % 2 ? '#ffcf40' : '#ff4a4a', 30, 1.2), i * 100);
      beep(85, 0.75, 'sawtooth', 0.09, 0.3);
    }
  }

  function updateBoss(dt) {
    if (boss.dead) return;
    if (!boss.active && player.x > boss.x - 420) {
      boss.active = true;
      addText('WARNING: ' + level.bossName, camera.x + VIEW_W / 2 - 130, 86, '#ff3333');
      beep(95, 0.35, 'sawtooth', 0.08, 0.5);
      camera.shake = 16;
    }
    if (!boss.active) return;
    boss.timer += dt;
    boss.spawnTimer -= dt;
    boss.phase = boss.hp < boss.maxHp * 0.45 ? 2 : boss.hp < boss.maxHp * 0.75 ? 1 : 0;
    for (const g of boss.guns) {
      if (g.hp <= 0) continue;
      g.cd -= dt;
      if (g.cd <= 0) {
        enemyShoot({ x: g.x, y: g.y, w: g.w, h: g.h }, boss.phase === 2 ? 365 : 310, boss.phase === 2 ? 0.18 : 0.08);
        g.cd = boss.phase === 2 ? rand(0.45, 0.8) : rand(0.75, 1.2);
      }
    }
    if (boss.spawnTimer <= 0) {
      const type = boss.phase === 2 && Math.random() < 0.45 ? 'heavy' : 'drone';
      const d = makeEnemy(type, boss.x - 120, type === 'drone' ? rand(140, 235) : undefined);
      if (type === 'drone') d.baseY = d.y;
      enemies.push(d);
      boss.spawnTimer = boss.phase === 2 ? 1.8 : 3.0;
    }
    if (Math.sin(boss.timer * (boss.phase + 1) * 2) > 0.96) {
      enemyBullets.push({ x: boss.x + 72, y: boss.y + 166, vx: -390, vy: rand(-95, 95), r: 8, damage: 2, ttl: 3, color: '#b16cff' });
    }
  }

  function updatePowerups(dt) {
    for (const p of powerups) {
      p.t += dt;
      p.life -= dt;
      const px = player.x + player.w / 2;
      const py = player.y + player.h / 2;
      const dx = px - (p.x + p.w / 2);
      const dy = py - (p.y + p.h / 2);
      const dist = Math.hypot(dx, dy) || 1;
      if ((player.magnet > 0 || cheats.hyper) && dist < 310) {
        p.x += dx / dist * 420 * dt;
        p.y += dy / dist * 420 * dt;
        p.vy *= 0.9;
      }
      p.vy += GRAVITY * 0.45 * dt;
      p.y += p.vy * dt;
      if (p.y + p.h >= level.ground && groundExistsUnder(p)) { p.y = level.ground - p.h; p.vy *= -0.25; }
      if (rectsOverlap(p, player) && !player.dead) {
        p.life = -1;
        grantPowerup(p.kind, p.x, p.y);
      }
    }
    powerups = powerups.filter(p => p.life > 0);
  }

  function updateParticles(dt) {
    cheatFlash.life = Math.max(0, cheatFlash.life - dt);
    for (const p of particles) {
      p.life -= dt;
      p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    particles = particles.filter(p => p.life > 0);
    for (const f of floatText) {
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy += 30 * dt;
    }
    floatText = floatText.filter(f => f.life > 0);
  }

  function update(dt) {
    stateTime += dt;
    if (consume('mute')) muted = !muted;
    if (cheatMenuOpen) {
      cheatFlash.life = Math.max(0, cheatFlash.life - dt);
      return;
    }
    if (state === 'title') {
      if (consume('start') || consume('shoot') || consume('jump')) resetGame();
      return;
    }
    if (state === 'levelclear') {
      updateParticles(dt);
      if (stateTime > 1.25 && (consume('start') || consume('shoot') || consume('jump'))) nextLevel();
      return;
    }
    if (state === 'gameover' || state === 'victory') {
      updateParticles(dt);
      if (consume('start') || consume('shoot')) resetGame();
      return;
    }
    if (consume('pause')) state = state === 'paused' ? 'playing' : 'paused';
    if (state === 'paused') return;
    runTime += dt;
    if (cheats.party && Math.random() < 0.35) {
      particles.push({ x: camera.x + rand(0, VIEW_W), y: rand(40, 230), vx: rand(-80, 80), vy: rand(-20, 80), r: rand(2, 6), life: rand(0.3, 0.8), max: 0.8, color: `hsl(${Math.floor(rand(0, 360))} 100% 65%)` });
    }
    comboTimer -= dt;
    if (comboTimer <= 0) combo = 0;
    updatePlayer(dt);
    updateEnemies(dt);
    updateBoss(dt);
    updateDrones(dt);
    updateBullets(dt);
    updatePowerups(dt);
    updateParticles(dt);
  }

  function beginDraw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
  }

  function drawBackground() {
    const t = runTime;
    const sx = camera.x;
    const theme = level.theme || LEVELS[0].theme;
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    sky.addColorStop(0, theme.sky1);
    sky.addColorStop(0.52, theme.sky2);
    sky.addColorStop(1, theme.sky3);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.fillStyle = theme.sun;
    ctx.shadowColor = theme.sun;
    ctx.shadowBlur = 28;
    ctx.beginPath();
    ctx.arc(812 - sx * 0.03, 82, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    for (let i = 0; i < 8; i++) {
      const cx = ((i * 260 - sx * (0.05 + i * 0.01)) % (VIEW_W + 360)) - 160;
      ctx.beginPath();
      ctx.ellipse(cx, 92 + i * 18 + Math.sin(t + i) * 3, 90 + i * 9, 10 + (i % 3) * 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    function hills(color, par, base, amp, step) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, VIEW_H);
      for (let x = -80; x <= VIEW_W + 80; x += step) {
        const wx = x + sx * par;
        const y = base + Math.sin(wx * 0.006) * amp + Math.sin(wx * 0.017) * amp * 0.35;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(VIEW_W, VIEW_H);
      ctx.closePath();
      ctx.fill();
    }
    hills(theme.hill1, 0.10, 276, 38, 40);
    hills(theme.hill2, 0.22, 342, 45, 36);
    hills(theme.hill3, 0.38, 397, 32, 30);

    // Late-90s arcade-style layered set dressing: bases, waterfalls, towers, alien machinery.
    for (const p of level.props) {
      const x = Math.floor(p.x - sx * 0.46);
      if (x < -220 || x > VIEW_W + 220) continue;
      const baseY = level.ground + 4;
      ctx.save();
      ctx.globalAlpha = 0.78;
      if (p.kind === 'waterfall' || p.kind === 'icefall') {
        const wg = ctx.createLinearGradient(0, baseY - p.h, 0, baseY);
        wg.addColorStop(0, p.kind === 'icefall' ? 'rgba(190,245,255,.75)' : 'rgba(90,210,255,.55)');
        wg.addColorStop(1, 'rgba(40,110,170,.12)');
        ctx.fillStyle = wg;
        roundRect(x, baseY - p.h, p.w, p.h + 20, 12); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.28)';
        for (let s = 0; s < 5; s++) ctx.fillRect(x + 12 + s * p.w / 5 + Math.sin(t * 5 + s) * 3, baseY - p.h + 10, 3, p.h - 4);
      } else if (p.kind === 'bunker' || p.kind === 'ruin') {
        fillRoundRect(x, baseY - p.h * 0.62, p.w, p.h * 0.62, 10, 'rgba(25,35,38,.75)');
        fillRoundRect(x + 12, baseY - p.h * 0.48, p.w - 24, 16, 5, 'rgba(255,190,80,.35)');
        ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 2;
        for (let yy = baseY - p.h * 0.55; yy < baseY - 10; yy += 24) { ctx.beginPath(); ctx.moveTo(x + 8, yy); ctx.lineTo(x + p.w - 8, yy + 8); ctx.stroke(); }
      } else if (p.kind === 'radar' || p.kind === 'antenna' || p.kind === 'tower') {
        ctx.strokeStyle = 'rgba(185,225,255,.45)'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(x + p.w / 2, baseY); ctx.lineTo(x + p.w / 2, baseY - p.h); ctx.stroke();
        ctx.lineWidth = 2;
        for (let r = 18; r < 52; r += 14) { ctx.beginPath(); ctx.arc(x + p.w / 2, baseY - p.h, r + Math.sin(t * 2 + p.phase) * 2, -0.6, 0.6); ctx.stroke(); }
        fillRoundRect(x + p.w / 2 - 16, baseY - p.h - 10, 32, 20, 6, 'rgba(210,245,255,.55)');
      } else if (p.kind === 'hivepod' || p.kind === 'ribcage' || p.kind === 'obelisk' || p.kind === 'vent') {
        ctx.shadowColor = 'rgba(255,83,215,.45)'; ctx.shadowBlur = 18;
        ctx.fillStyle = p.kind === 'ribcage' ? 'rgba(210,120,255,.28)' : 'rgba(110,32,125,.62)';
        if (p.kind === 'obelisk') {
          ctx.beginPath(); ctx.moveTo(x + p.w / 2, baseY - p.h); ctx.lineTo(x + p.w, baseY); ctx.lineTo(x, baseY); ctx.closePath(); ctx.fill();
        } else {
          ctx.beginPath(); ctx.ellipse(x + p.w / 2, baseY - p.h * 0.45, p.w / 2, p.h * 0.45, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(255,130,240,.5)'; ctx.lineWidth = 4;
          for (let r = 0; r < 4; r++) { ctx.beginPath(); ctx.arc(x + p.w / 2, baseY - p.h * 0.4, 18 + r * 15, 0.5, 2.7); ctx.stroke(); }
        }
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }

    for (const d of level.decorations) {
      const x = Math.floor(d.x - sx * 0.62);
      if (x < -120 || x > VIEW_W + 120) continue;
      const y = level.ground + 2;
      const sway = Math.sin(t * 1.5 + d.sway) * 3;
      if (d.kind === 'palm') {
        ctx.fillStyle = '#3b2919';
        ctx.fillRect(x - 4, y - d.h, 8, d.h);
        ctx.fillStyle = '#0f6f35';
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * Math.PI * 2 + sway * 0.03;
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(a) * 18, y - d.h + Math.sin(a) * 7, 24, 7, a, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (d.kind === 'pine') {
        ctx.fillStyle = '#263040';
        ctx.fillRect(x - 4, y - d.h, 8, d.h);
        ctx.fillStyle = '#c9f5ff';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(x, y - d.h + i * 22);
          ctx.lineTo(x - 28 + i * 4, y - d.h + 38 + i * 18);
          ctx.lineTo(x + 28 - i * 4, y - d.h + 38 + i * 18);
          ctx.closePath();
          ctx.fill();
        }
      } else if (d.kind === 'crystal') {
        ctx.fillStyle = levelIndex === 2 ? '#ff53d7' : '#9eeeff';
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(x + i * 14, y - d.h * 0.72);
          ctx.lineTo(x + i * 14 - 9, y);
          ctx.lineTo(x + i * 14 + 9, y);
          ctx.closePath();
          ctx.fill();
        }
      } else if (d.kind === 'pipe') {
        ctx.fillStyle = '#4d315f';
        ctx.fillRect(x - 10, y - d.h * 0.75, 20, d.h * 0.75);
        ctx.fillStyle = '#a53fff';
        ctx.fillRect(x - 15, y - d.h * 0.75, 30, 8);
      } else {
        ctx.fillStyle = '#11783b';
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.ellipse(x + i * 7, y - d.h * 0.25, 8, d.h * 0.27, i * 0.35 + sway * 0.02, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawWorld() {
    // Smooth camera trauma instead of per-frame random jitter.
    // This avoids the distracting full-screen shudder when firing rockets/lasers.
    const trauma = camera.shake || 0;
    const shakeX = trauma > 1 ? Math.sin(runTime * 87) * trauma : 0;
    const shakeY = trauma > 6 ? Math.cos(runTime * 71) * trauma * 0.28 : 0;
    ctx.save();
    ctx.translate(Math.floor(-camera.x + shakeX), Math.floor(shakeY));

    // ground and pits
    const theme = level.theme || LEVELS[0].theme;
    let gx = 0;
    const sorted = [...level.pits, { x: level.width, w: 0 }];
    for (const p of sorted) {
      if (p.x > gx) {
        const g = ctx.createLinearGradient(0, level.ground, 0, VIEW_H);
        g.addColorStop(0, theme.groundTop);
        g.addColorStop(0.08, theme.ground);
        g.addColorStop(1, '#05070d');
        ctx.fillStyle = g;
        ctx.fillRect(gx, level.ground, p.x - gx, VIEW_H - level.ground);
        ctx.fillStyle = 'rgba(255,255,255,.16)';
        ctx.fillRect(gx, level.ground, p.x - gx, 3);
        ctx.fillStyle = 'rgba(0,0,0,.20)';
        for (let tx = Math.floor(gx / 64) * 64; tx < p.x; tx += 64) ctx.fillRect(tx + 8, level.ground + 22 + ((tx / 64) % 3) * 8, 34, 3);
      }
      gx = p.x + p.w;
    }
    for (const p of level.pits) {
      const pit = ctx.createLinearGradient(0, level.ground, 0, VIEW_H);
      pit.addColorStop(0, 'rgba(0,0,0,.35)');
      pit.addColorStop(1, 'rgba(0,0,0,.9)');
      ctx.fillStyle = pit;
      ctx.fillRect(p.x, level.ground, p.w, VIEW_H - level.ground);
      ctx.fillStyle = levelIndex === 2 ? 'rgba(255,83,215,.25)' : 'rgba(70,180,255,.10)';
      ctx.fillRect(p.x + 8, level.ground + 18, p.w - 16, 4);
    }

    // platforms
    for (const p of level.platforms) {
      ctx.shadowColor = 'rgba(0,0,0,.45)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 8;
      fillRoundRect(p.x, p.y, p.w, p.h, 7, theme.platform);
      ctx.shadowBlur = 0;
      const pg = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      pg.addColorStop(0, theme.platformTop);
      pg.addColorStop(0.38, theme.platform);
      pg.addColorStop(1, 'rgba(0,0,0,.55)');
      fillRoundRect(p.x, p.y, p.w, p.h, 7, pg);
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      ctx.fillRect(p.x + 10, p.y + 4, p.w - 20, 2);
    }
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowColor = 'transparent';

    // crates
    for (const c of level.crates) {
      if (c.hp <= 0) continue;
      const cg = ctx.createLinearGradient(c.x, c.y, c.x + c.w, c.y + c.h);
      cg.addColorStop(0, theme.crateLine);
      cg.addColorStop(0.45, theme.crate);
      cg.addColorStop(1, '#26150f');
      fillRoundRect(c.x, c.y, c.w, c.h, 7, cg);
      ctx.strokeStyle = theme.crateLine;
      ctx.lineWidth = 3;
      strokeRoundRect(c.x + 3, c.y + 3, c.w - 6, c.h - 6, 5, theme.crateLine, 3);
      ctx.beginPath();
      ctx.moveTo(c.x + 8, c.y + 8);
      ctx.lineTo(c.x + c.w - 8, c.y + c.h - 8);
      ctx.moveTo(c.x + c.w - 8, c.y + 8);
      ctx.lineTo(c.x + 8, c.y + c.h - 8);
      ctx.stroke();
    }

    drawBoss();
    for (const p of powerups) drawPowerup(p);
    for (const e of enemies) if (e.alive) drawEnemy(e);
    drawDrones();
    drawPlayer();
    drawBullets();
    drawParticles();
    ctx.restore();
  }

  function drawPlayer() {
    if (player.dead) return;
    if (player.invuln > 0 && !cheats.god && Math.floor(runTime * 18) % 2 === 0) return;
    const x = player.x, y = player.y, w = player.w, h = player.h;
    const crouch = player.crouch;
    const stride = player.onGround ? Math.sin(runTime * 15) * clamp(Math.abs(player.vx) / 290, 0, 1) : 0;
    const lean = clamp(player.vx / 600, -0.18, 0.18);
    ctx.save();
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h + 4, 24, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (player.shield > 0) {
      const pulse = 1 + Math.sin(runTime * 7) * 0.05;
      ctx.save();
      ctx.shadowColor = '#63e7ff';
      ctx.shadowBlur = 20;
      ctx.strokeStyle = cheats.god ? 'rgba(255,207,64,.75)' : 'rgba(99,231,255,.62)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, 30 * pulse, 40 * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(player.facing, 1);
    ctx.rotate(lean * player.facing);
    ctx.translate(-w / 2, -h / 2);
    const suit = ctx.createLinearGradient(0, 0, 0, h);
    suit.addColorStop(0, player.overdrive > 0 ? '#ff6cff' : '#ff5b4d');
    suit.addColorStop(0.5, player.shield > 0 ? '#2cc7ff' : '#b51f2f');
    suit.addColorStop(1, '#361224');
    fillRoundRect(5, crouch ? 18 : 13, 20, crouch ? 28 : 36, 8, suit);
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.fillRect(10, crouch ? 21 : 17, 4, crouch ? 18 : 25);
    ctx.fillStyle = '#ffe0b0';
    roundRect(7, crouch ? 8 : 0, 16, 16, 7); ctx.fill();
    const visor = ctx.createLinearGradient(0, 0, 22, 0);
    visor.addColorStop(0, '#111827'); visor.addColorStop(1, '#63e7ff');
    fillRoundRect(4, crouch ? 6 : -2, 22, 7, 3, visor);

    ctx.strokeStyle = '#ffe0b0';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(20, crouch ? 27 : 23);
    ctx.lineTo(35, crouch ? 25 : 21);
    ctx.stroke();
    ctx.strokeStyle = '#1a2230';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(32, crouch ? 24 : 20);
    ctx.lineTo(56, crouch ? 22 : 18);
    ctx.stroke();
    ctx.strokeStyle = weaponInfo().color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(42, crouch ? 18 : 14); ctx.lineTo(58, crouch ? 17 : 13); ctx.stroke();

    ctx.strokeStyle = '#1e3a66';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(10, 43); ctx.lineTo(6 - stride * 4, 56); ctx.lineTo(4 - stride * 7, 64);
    ctx.moveTo(20, 43); ctx.lineTo(22 + stride * 4, 56); ctx.lineTo(25 + stride * 7, 64);
    ctx.stroke();
    ctx.strokeStyle = '#0d1320';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0 - stride * 7, 64); ctx.lineTo(10 - stride * 7, 64);
    ctx.moveTo(21 + stride * 7, 64); ctx.lineTo(31 + stride * 7, 64);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  function drawDrones() {
    if (!player || !Array.isArray(player.drones) || !player.drones.length || player.dead) return;
    ctx.save();
    const total = player.drones.length;
    for (let i = 0; i < total; i++) {
      const d = player.drones[i];
      const { x, y } = dronePos(i, total, d);
      ctx.shadowColor = d.color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = d.type === 'shield' ? 'rgba(99,231,255,.16)' : 'rgba(119,247,255,.18)';
      ctx.beginPath(); ctx.arc(x, y, d.type === 'shield' ? 22 : 15, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createLinearGradient(x - 12, y - 9, x + 12, y + 9);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.42, d.color); g.addColorStop(1, '#1d2740');
      if (d.type === 'striker') {
        ctx.save(); ctx.translate(x, y); ctx.rotate(player.facing > 0 ? 0 : Math.PI);
        ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-9, -9); ctx.lineTo(-5, 0); ctx.lineTo(-9, 9); ctx.closePath(); ctx.fillStyle = g; ctx.fill(); ctx.restore();
      } else if (d.type === 'blaster') {
        ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        fillRoundRect(x - 4, y - 15, 8, 30, 4, '#251433');
      } else if (d.type === 'shield') {
        strokeRoundRect(x - 13, y - 10, 26, 20, 10, d.color, 4);
      } else if (d.type === 'repair') {
        fillRoundRect(x - 11, y - 8, 22, 16, 7, g);
        ctx.fillStyle = '#10301f'; ctx.fillRect(x - 2, y - 7, 4, 14); ctx.fillRect(x - 7, y - 2, 14, 4);
      } else {
        fillRoundRect(x - 10, y - 6, 20, 12, 6, g);
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x + 4, y - 1, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawEnemy(e) {
    const flash = e.hit > 0;
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(e.x + e.w / 2, e.y + e.h + 3, e.w * 0.55, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowColor = flash ? '#fff' : 'rgba(255,70,70,.35)';
    ctx.shadowBlur = flash ? 18 : 6;
    if (e.type === 'turret') {
      const g = ctx.createLinearGradient(e.x, e.y, e.x, e.y + e.h);
      g.addColorStop(0, flash ? '#fff' : '#9ba4b4');
      g.addColorStop(1, '#353c49');
      fillRoundRect(e.x, e.y + 12, e.w, e.h - 12, 8, g);
      fillRoundRect(e.x + (e.dir < 0 ? -30 : e.w - 2), e.y + 18, 32, 9, 4, '#151b25');
      fillRoundRect(e.x + 8, e.y + 4, 26, 18, 7, flash ? '#fff' : '#ff4d63');
    } else if (e.type === 'drone') {
      const g = ctx.createRadialGradient(e.x + e.w / 2, e.y + e.h / 2, 4, e.x + e.w / 2, e.y + e.h / 2, e.w / 2);
      g.addColorStop(0, flash ? '#fff' : '#c8fbff');
      g.addColorStop(1, '#247496');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(e.x + e.w / 2, e.y + e.h / 2, e.w / 2, e.h / 2, 0, 0, Math.PI * 2); ctx.fill();
      fillRoundRect(e.x + 8, e.y + 10, e.w - 16, 7, 3, '#18334b');
      ctx.strokeStyle = '#c8fbff'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(e.x - 12, e.y + 4); ctx.lineTo(e.x + 4, e.y + 12);
      ctx.moveTo(e.x + e.w + 12, e.y + 4); ctx.lineTo(e.x + e.w - 4, e.y + 12);
      ctx.stroke();
    } else {
      const stride = Math.sin(e.t * 10) * 4;
      const armor = ctx.createLinearGradient(e.x, e.y, e.x, e.y + e.h);
      armor.addColorStop(0, flash ? '#fff' : '#f0d87b');
      armor.addColorStop(0.55, e.type === 'runner' ? '#e65b39' : e.type === 'heavy' ? '#7f8b9a' : e.type === 'sniper' ? '#4cc7a5' : '#97773b');
      armor.addColorStop(1, '#2b1b18');
      fillRoundRect(e.x + 7, e.y + 12, e.w - 14, e.h - 16, 8, armor);
      fillRoundRect(e.x + 9, e.y + 1, e.w - 18, 17, 7, flash ? '#fff' : e.type === 'sniper' ? '#17382f' : '#7b3b24');
      ctx.strokeStyle = '#18202b'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(e.x + e.w / 2, e.y + 38); ctx.lineTo(e.x + 9 + stride, e.y + e.h);
      ctx.moveTo(e.x + e.w / 2, e.y + 38); ctx.lineTo(e.x + e.w - 9 - stride, e.y + e.h);
      ctx.stroke();
      fillRoundRect(e.x + (e.dir < 0 ? (e.type === 'sniper' ? -30 : -16) : e.w - 1), e.y + 23, e.type === 'sniper' ? 36 : 22, e.type === 'heavy' ? 9 : 6, 3, '#20262e');
      if (e.type === 'heavy') { fillRoundRect(e.x + 10, e.y + 25, e.w - 20, 10, 5, '#ffcf40'); }
    }
    ctx.shadowBlur = 0;
    fillRoundRect(e.x, e.y - 9, e.w, 5, 3, '#101010');
    fillRoundRect(e.x, e.y - 9, e.w * Math.max(0, e.hp / e.maxHp), 5, 3, '#ff5252');
    ctx.restore();
  }

  function drawBoss() {
    if (!boss.active && camera.x < boss.x - VIEW_W) return;
    if (boss.dead) return;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.65)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 14;
    const hull = ctx.createLinearGradient(boss.x, boss.y, boss.x, boss.y + boss.h);
    hull.addColorStop(0, '#566071');
    hull.addColorStop(0.45, '#293244');
    hull.addColorStop(1, '#0d111a');
    fillRoundRect(boss.x, boss.y, boss.w, boss.h, 22, hull);
    ctx.shadowBlur = 0;
    fillRoundRect(boss.x + 35, boss.y + 34, boss.w - 70, boss.h - 34, 18, '#151b26');
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 3;
    strokeRoundRect(boss.x + 8, boss.y + 8, boss.w - 16, boss.h - 16, 18, 'rgba(255,255,255,.15)', 3);
    const coreColor = boss.phase === 2 ? '#ff3636' : levelIndex === 2 ? '#ff53d7' : '#8e47ff';
    ctx.shadowColor = coreColor; ctx.shadowBlur = 30;
    const core = ctx.createRadialGradient(boss.x + 165, boss.y + 126, 10, boss.x + 165, boss.y + 126, 64);
    core.addColorStop(0, '#fff'); core.addColorStop(0.28, coreColor); core.addColorStop(1, '#250713');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(boss.x + 165, boss.y + 126, 56 + Math.sin(runTime * 8) * 4, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#250713'; ctx.beginPath(); ctx.arc(boss.x + 165, boss.y + 126, 28, 0, Math.PI * 2); ctx.fill();
    for (const g of boss.guns) {
      if (g.hp <= 0) { fillRoundRect(g.x, g.y, g.w, g.h, 8, '#222'); continue; }
      const gg = ctx.createLinearGradient(g.x, g.y, g.x, g.y + g.h);
      gg.addColorStop(0, '#a7afbc'); gg.addColorStop(1, '#434b58');
      fillRoundRect(g.x, g.y, g.w, g.h, 8, gg);
      fillRoundRect(g.x - 31, g.y + 16, 38, 12, 5, '#111720');
      fillRoundRect(g.x + 7, g.y + 7, g.w - 14, 6, 3, '#ffcf40');
    }
    fillRoundRect(boss.x + 30, boss.y - 20, boss.w - 60, 11, 5, '#101010');
    fillRoundRect(boss.x + 30, boss.y - 20, (boss.w - 60) * Math.max(0, boss.hp / boss.maxHp), 11, 5, '#ff3c3c');
    ctx.restore();
  }

  function drawPowerup(p) {
    const bob = Math.sin(p.t * 7) * 3;
    const info = powerupInfo(p.kind);
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2 + bob;
    ctx.save();
    ctx.shadowColor = info.color;
    ctx.shadowBlur = 18;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 24);
    g.addColorStop(0, '#fff'); g.addColorStop(0.45, info.color); g.addColorStop(1, 'rgba(0,0,0,.65)');
    fillRoundRect(p.x, p.y + bob, p.w, p.h, 9, g);
    strokeRoundRect(p.x + 2, p.y + 2 + bob, p.w - 4, p.h - 4, 7, 'rgba(255,255,255,.75)', 2);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#14202c'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    if (info.icon === 'heal') { ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy); ctx.stroke(); }
    else if (info.icon === 'shield') { ctx.beginPath(); ctx.moveTo(cx, cy - 10); ctx.lineTo(cx + 9, cy - 5); ctx.lineTo(cx + 6, cy + 8); ctx.lineTo(cx, cy + 12); ctx.lineTo(cx - 6, cy + 8); ctx.lineTo(cx - 9, cy - 5); ctx.closePath(); ctx.stroke(); }
    else if (info.icon === 'drone') { ctx.beginPath(); ctx.ellipse(cx, cy, 11, 7, 0, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + 5, cy - 1, 2, 0, Math.PI * 2); ctx.stroke(); }
    else if (info.icon === 'boots') { ctx.beginPath(); ctx.moveTo(cx - 8, cy - 6); ctx.lineTo(cx - 8, cy + 8); ctx.lineTo(cx + 5, cy + 8); ctx.moveTo(cx + 1, cy - 6); ctx.lineTo(cx + 1, cy + 8); ctx.lineTo(cx + 12, cy + 8); ctx.stroke(); }
    else if (info.icon === 'magnet') { ctx.beginPath(); ctx.arc(cx, cy, 10, 0.2, Math.PI - 0.2); ctx.stroke(); }
    else if (info.icon === 'nova') { ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12); } ctx.stroke(); }
    else if (info.icon === 'bolt') { ctx.beginPath(); ctx.moveTo(cx + 2, cy - 12); ctx.lineTo(cx - 6, cy + 2); ctx.lineTo(cx + 2, cy + 2); ctx.lineTo(cx - 2, cy + 12); ctx.stroke(); }
    else { ctx.fillStyle = '#14202c'; ctx.font = '900 11px monospace'; ctx.textAlign = 'center'; ctx.fillText(info.name.slice(0, 3), cx, cy + 4); }
    const labelW = Math.max(60, info.label.length * 7 + 14);
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 8;
    fillRoundRect(cx - labelW / 2, p.y + bob - 20, labelW, 16, 8, 'rgba(5,10,18,.78)');
    ctx.shadowBlur = 0;
    ctx.fillStyle = info.color;
    ctx.font = '900 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(info.label, cx, p.y + bob - 8);
    ctx.restore();
  }

  function drawBullets() {
    ctx.save();
    for (const b of bullets) {
      ctx.shadowColor = b.color;
      ctx.shadowBlur = b.type === 'laser' ? 18 : 10;
      ctx.fillStyle = b.color;
      if (b.type === 'laser') {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx));
        fillRoundRect(-24, -3, 48, 6, 3, b.color);
        fillRoundRect(-10, -1, 24, 2, 1, '#fff');
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.beginPath(); ctx.arc(b.x - b.r * 0.25, b.y - b.r * 0.25, b.r * 0.38, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const b of enemyBullets) {
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff0a5';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.6 + a), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    for (const f of floatText) {
      ctx.globalAlpha = clamp(f.life / 0.8, 0, 1);
      ctx.fillStyle = '#071018';
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
  }

  function drawHUD() {
    ctx.save();
    ctx.fillStyle = 'rgba(4,8,16,.64)';
    ctx.fillRect(16, 14, 380, 84);
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.strokeRect(16.5, 14.5, 380, 84);
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.fillText('SCORE ' + String(score).padStart(6, '0'), 28, 39);
    ctx.fillText('LIVES ' + Math.max(0, player.lives), 28, 63);
    ctx.fillStyle = '#ffcf40';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('LV ' + (levelIndex + 1) + '/' + LEVELS.length + ' ' + level.name, 28, 90);
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillStyle = '#111';
    ctx.fillRect(164, 49, 96, 12);
    ctx.fillStyle = '#ff4545';
    ctx.fillRect(164, 49, 96 * Math.max(0, player.hp / player.maxHp), 12);
    if (player.shield > 0) {
      ctx.fillStyle = '#63e7ff';
      ctx.fillRect(164, 64, 96 * Math.min(1, player.shield / 7), 5);
    }
    ctx.fillStyle = weaponInfo().color;
    ctx.fillText(weaponInfo().name, 276, 63);
    ctx.fillStyle = '#111';
    ctx.fillRect(276, 24, 72, 8);
    ctx.fillStyle = '#b16cff';
    ctx.fillRect(276, 24, 72 * Math.max(0, player.energy / player.maxEnergy), 8);
    if (droneCount() > 0 || player.overdrive > 0 || player.boots > 0 || player.magnet > 0 || cheats.god) {
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = cheats.god ? '#ffcf40' : '#77f7ff';
      const status = [cheats.god ? 'GOD' : '', droneCount() ? 'DRONES ' + droneCount() : '', player.overdrive > 0 ? 'OD' : '', player.boots > 0 ? 'BOOTS' : '', player.magnet > 0 ? 'MAG' : ''].filter(Boolean).join('  ');
      ctx.fillText(status, 380, 39);
      ctx.font = 'bold 18px monospace';
    }
    if (combo > 1) {
      ctx.fillStyle = '#ffcf40';
      ctx.textAlign = 'right';
      ctx.fillText('x' + combo + ' COMBO', VIEW_W - 28, 42);
    }
    if (cheatFlash.life > 0) {
      ctx.textAlign = 'center';
      ctx.font = '900 22px monospace';
      ctx.fillStyle = '#ffcf40';
      ctx.fillText(cheatFlash.text, VIEW_W / 2, 92);
    }
    ctx.fillStyle = 'rgba(255,255,255,.76)';
    ctx.textAlign = 'right';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('Arrows move/aim  Space jump  F fire  D ion blast  R/E switch weapons  C cheats', VIEW_W - 18, VIEW_H - 18);
    ctx.restore();
  }

  function drawTitle() {
    drawBackground();
    ctx.fillStyle = 'rgba(0,0,0,.48)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff3434';
    ctx.font = '900 64px monospace';
    ctx.fillText('CODE RED', VIEW_W / 2, 150);
    ctx.fillStyle = '#ffcf40';
    ctx.font = '900 30px monospace';
    ctx.fillText('JUNGLE RUN', VIEW_W / 2, 190);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('A fast side-scrolling run-and-gun arcade mission', VIEW_W / 2, 240);
    ctx.fillText('Blast soldiers, drones, turrets, crates, powerups, and a fortress boss.', VIEW_W / 2, 268);
    ctx.fillStyle = Math.floor(stateTime * 3) % 2 ? '#ffcf40' : '#fff';
    ctx.font = '900 24px monospace';
    ctx.fillText('PRESS ENTER / F / CLICK TO DEPLOY', VIEW_W / 2, 340);
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.font = 'bold 15px monospace';
    ctx.fillText('Arrows: move & aim   Space: jump   F: main fire   D: ion blast   R/E: switch weapons', VIEW_W / 2, 400);
    ctx.fillText('Press C for the cheat menu: god mode, drones, powerup rain, party mode, and more.', VIEW_W / 2, 426);
  }

  function drawOverlay(title, subtitle) {
    ctx.fillStyle = 'rgba(0,0,0,.58)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = title === 'MISSION COMPLETE' ? '#78ff7d' : '#ff4545';
    ctx.font = '900 48px monospace';
    ctx.fillText(title, VIEW_W / 2, 218);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(subtitle, VIEW_W / 2, 262);
    ctx.fillStyle = '#ffcf40';
    ctx.fillText('Final Score: ' + score, VIEW_W / 2, 304);
    ctx.fillStyle = Math.floor(stateTime * 3) % 2 ? '#fff' : '#ffcf40';
    ctx.fillText('PRESS ENTER / FIRE TO RESTART', VIEW_W / 2, 356);
  }

  function drawLevelClear() {
    ctx.fillStyle = 'rgba(0,0,0,.58)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#78ff7d';
    ctx.font = '900 46px monospace';
    ctx.fillText('BOSS DESTROYED!', VIEW_W / 2, 184);
    ctx.fillStyle = '#78ff7d';
    ctx.font = '900 34px monospace';
    ctx.fillText('LEVEL ' + (levelIndex + 1) + ' CLEARED', VIEW_W / 2, 230);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(level.bossName + ' exploded. You survived.', VIEW_W / 2, 270);
    ctx.fillStyle = '#ffcf40';
    ctx.fillText('Going to next level: ' + LEVELS[levelIndex + 1].name, VIEW_W / 2, 316);
    ctx.fillStyle = stateTime < 1.25 ? 'rgba(255,255,255,.55)' : (Math.floor(stateTime * 3) % 2 ? '#fff' : '#ffcf40');
    ctx.fillText(stateTime < 1.25 ? 'STAGE CLEAR BONUS...' : 'PRESS ENTER / F / SPACE TO CONTINUE', VIEW_W / 2, 370);
  }

  function drawPostFX() {
    const vignette = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.2, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.65);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,.38)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = 'rgba(255,255,255,.035)';
    for (let y = 0; y < VIEW_H; y += 4) ctx.fillRect(0, y, VIEW_W, 1);
  }

  function render() {
    beginDraw();
    if (state === 'title') {
      drawTitle();
      return;
    }
    drawBackground();
    drawWorld();
    drawPostFX();
    drawHUD();
    if (state === 'paused') {
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = '900 44px monospace';
      ctx.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2);
      ctx.font = 'bold 18px monospace';
      ctx.fillText('Press P/Esc to resume', VIEW_W / 2, VIEW_H / 2 + 40);
    } else if (state === 'levelclear') {
      drawLevelClear();
    } else if (state === 'gameover') {
      drawOverlay('MISSION FAILED', 'The invasion overran the squad.');
    } else if (state === 'victory') {
      drawOverlay('MISSION COMPLETE', 'All enemy strongholds destroyed. Extraction inbound.');
    }
  }

  let last = performance.now();
  function loop(now) {
    let dt = Math.min(MAX_DT, (now - last) / 1000);
    last = now;
    if (cheats.slowmo && state === 'playing') dt *= 0.45;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  buildLevel();
  requestAnimationFrame(loop);
})();
