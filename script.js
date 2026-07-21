const canvas = document.getElementById('stars');
const ctx = canvas.getContext('2d');

let width = window.innerWidth;
let height = window.innerHeight;
let particles = [];

const mouse = { x: 0, y: 0, active: false };
const REPULSION_RADIUS = 140;
const REPULSION_FORCE = 0.22;
const FORMATION_DELAY = 10000;
const FORMATION_DURATION = 3400;
const PARTICLE_RADIUS = 3.5;
const PHRASE_DISPLAY_MS = 5000;
const PHRASE_FADE_MS = 1000;
const EXPLOSION_DELAY_MS = 1500;
const OFFSCREEN_MARGIN = 100;
const EXPLOSION_MAX_MS = 4500;
const LOVE_RAIN_TEXT = 'eu te amo';
const LOVE_RAIN_COUNT = 90;
const GIFT_CHANCE = 0.01;
const ALBUM_PHOTOS = [
  'IMG_20260604_232723_684.jpg',
  'IMG_20260604_232739_287.jpg',
  'IMG_20260706_003817_609.jpg',
  'IMG_20260706_003820_743.jpg',
  'WhatsApp Image 2026-07-21 at 12.24.22.jpeg',
];

const PHRASES = [
  'Oi Meu Amor, Hoje eu só queria que você soubesse o quanto eu te admiro',
  'Nesse tempo você se uma das pessoas mais importantes da minha vida',
  'Você tem uma luz que não da pra explicar',
  'Eu olho pra você e vejo tanto, mais do que beleza',
  'Vejo um coração enorme que merece o melhor dessa vida',
  'É um privilegio viver te conhecer e viver esse amor com você',
  'EU TE AMOOOO',
];

let phase = 'floating';
let pageStartTime = 0;
let formationStartTime = 0;
let explosionStartTime = 0;
let formedStartTime = 0;
let phraseIndex = 0;
let messagesStarted = false;
let phraseTimeouts = [];
let loveDrops = [];
let rainStarted = false;
let shockwaves = [];

const messageEl = document.getElementById('message');
const messageTextEl = document.getElementById('message-text');
const loveRainEl = document.getElementById('love-rain');
const flashEl = document.getElementById('flash');

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutQuint(t) {
  return 1 - Math.pow(1 - t, 5);
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function getHeartLayout() {
  const shortest = Math.min(width, height);
  const isMobile = width <= 768;
  const isNarrow = width <= 400;

  let scale = shortest / 52;
  if (isNarrow) scale = shortest / 44;
  else if (isMobile) scale = shortest / 47;

  return {
    cx: width / 2,
    cy: height / 2 + height * (isMobile ? 0.02 : 0.05),
    scale,
  };
}

function heartPoint(t) {
  return {
    x: 16 * Math.pow(Math.sin(t), 3),
    y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
  };
}

function resamplePolyline(points, count) {
  if (count === 0 || points.length === 0) return [];

  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(
      cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    );
  }

  const totalLength = cumulative[cumulative.length - 1];
  const result = [];

  for (let i = 0; i < count; i++) {
    const dist = (i / count) * totalLength;
    let j = 1;

    while (j < cumulative.length && cumulative[j] < dist) {
      j++;
    }

    j = Math.min(j, points.length - 1);
    const segStart = cumulative[j - 1];
    const segLen = cumulative[j] - segStart || 1;
    const t = (dist - segStart) / segLen;

    result.push({
      x: points[j - 1].x + (points[j].x - points[j - 1].x) * t,
      y: points[j - 1].y + (points[j].y - points[j - 1].y) * t,
    });
  }

  return result;
}

function generateHeartTargets(count) {
  const { cx, cy, scale } = getHeartLayout();
  const samples = Math.max(count * 6, 600);
  const outline = [];

  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    const { x, y } = heartPoint(t);
    outline.push({
      x: cx + x * scale,
      y: cy + y * scale,
    });
  }

  return resamplePolyline(outline, count);
}

function assignTargets(targets, captureStart) {
  const { cx, cy } = getHeartLayout();
  const used = new Array(targets.length).fill(false);

  const orderedParticles = particles
    .map((p) => ({
      p,
      dist: Math.hypot(p.x - cx, p.y - cy),
    }))
    .sort((a, b) => b.dist - a.dist);

  let maxDist = 1;
  for (const item of orderedParticles) {
    maxDist = Math.max(maxDist, item.dist);
  }

  for (const { p, dist } of orderedParticles) {
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let i = 0; i < targets.length; i++) {
      if (used[i]) continue;

      const d = Math.hypot(p.x - targets[i].x, p.y - targets[i].y);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    used[bestIdx] = true;
    const target = targets[bestIdx];

    if (captureStart) {
      p.startX = p.x;
      p.startY = p.y;
      p.delay = (dist / maxDist) * 0.45;
    }

    p.targetX = target.x;
    p.targetY = target.y;
    p.vx = 0;
    p.vy = 0;
  }
}

function createParticles() {
  const density = width <= 768 ? 6200 : 5000;
  const count = Math.floor((width * height) / density);
  particles = [];

  for (let i = 0; i < count; i++) {
    const baseVx = random(-0.08, 0.08);
    const baseVy = random(-0.08, 0.08);

    particles.push({
      x: random(0, width),
      y: random(0, height),
      radius: width <= 768 ? 3.1 : PARTICLE_RADIUS,
      vx: baseVx,
      vy: baseVy,
      baseVx,
      baseVy,
      glow: random(11, 18),
      brightness: random(0.88, 1),
      startX: 0,
      startY: 0,
      targetX: 0,
      targetY: 0,
      delay: 0,
      trail: [],
      alpha: 1,
      alive: true,
    });
  }
}

function startFormation() {
  phase = 'forming';
  formationStartTime = performance.now();
  mouse.active = false;

  const targets = generateHeartTargets(particles.length);
  assignTargets(targets, true);
}

function applyHeartTargets() {
  const targets = generateHeartTargets(particles.length);
  assignTargets(targets, false);

  if (phase === 'formed') {
    for (const p of particles) {
      p.x = p.targetX;
      p.y = p.targetY;
    }
  }
}

function clearPhraseTimeouts() {
  phraseTimeouts.forEach(clearTimeout);
  phraseTimeouts = [];
}

function setPhraseTimeout(fn, ms) {
  const id = setTimeout(fn, ms);
  phraseTimeouts.push(id);
}

function cyclePhrase() {
  const index = phraseIndex;
  const isFinal = index === PHRASES.length - 1;

  messageTextEl.classList.remove('show', 'leaving', 'final');
  messageTextEl.textContent = PHRASES[index];
  messageTextEl.classList.toggle('final', isFinal);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      messageTextEl.classList.add('show');
    });
  });

  if (isFinal) {
    setPhraseTimeout(() => {
      startExplosion();
    }, EXPLOSION_DELAY_MS);
    return;
  }

  setPhraseTimeout(() => {
    messageTextEl.classList.remove('show');
    messageTextEl.classList.add('leaving');

    setPhraseTimeout(() => {
      messageTextEl.classList.remove('leaving');
      phraseIndex += 1;
      cyclePhrase();
    }, PHRASE_FADE_MS);
  }, PHRASE_DISPLAY_MS);
}

function triggerFlash() {
  flashEl.classList.remove('burst');
  void flashEl.offsetWidth;
  flashEl.classList.add('burst');
}

function startExplosion() {
  if (phase === 'exploding' || phase === 'done') return;

  phase = 'exploding';
  explosionStartTime = performance.now();
  triggerFlash();

  messageTextEl.classList.remove('show', 'final');
  messageTextEl.classList.add('leaving');
  setPhraseTimeout(() => {
    messageEl.classList.remove('visible');
    messageEl.classList.add('hidden');
  }, PHRASE_FADE_MS);

  const { cx, cy } = getHeartLayout();
  shockwaves.push({ x: cx, y: cy, r: 0, alpha: 0.55, born: performance.now() });

  for (const p of particles) {
    let dx = p.x - cx;
    let dy = p.y - cy;
    let dist = Math.hypot(dx, dy);

    if (dist < 1) {
      const angle = random(0, Math.PI * 2);
      dx = Math.cos(angle);
      dy = Math.sin(angle);
      dist = 1;
    }

    const speed = random(7, 16);
    p.vx = (dx / dist) * speed + random(-1.1, 1.1);
    p.vy = (dy / dist) * speed + random(-1.1, 1.1);
    p.trail = [];
    p.alpha = 1;
    p.alive = true;
  }
}

function finishExplosion() {
  if (phase === 'done') return;
  phase = 'done';
  particles = [];
  shockwaves = [];
  startLoveRain();
}

function updateExploding(now) {
  let remaining = 0;
  const timedOut = now - explosionStartTime >= EXPLOSION_MAX_MS;

  for (const wave of shockwaves) {
    const age = (now - wave.born) / 900;
    wave.r = easeOutQuint(Math.min(age, 1)) * Math.min(width, height) * 0.55;
    wave.alpha = Math.max(0, 0.5 * (1 - age));
  }
  shockwaves = shockwaves.filter((w) => w.alpha > 0.01);

  for (const p of particles) {
    if (!p.alive) continue;

    p.trail.push({ x: p.x, y: p.y, alpha: p.alpha });
    if (p.trail.length > 7) p.trail.shift();

    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.998;
    p.vy *= 0.998;
    p.alpha = Math.max(0, p.alpha - 0.004);

    const speed = Math.hypot(p.vx, p.vy);
    const offscreen =
      p.x < -OFFSCREEN_MARGIN ||
      p.x > width + OFFSCREEN_MARGIN ||
      p.y < -OFFSCREEN_MARGIN ||
      p.y > height + OFFSCREEN_MARGIN;

    if (offscreen || timedOut || p.alpha <= 0.02 || speed < 0.12) {
      p.alive = false;
    } else {
      remaining += 1;
    }
  }

  if (remaining === 0 || timedOut) {
    finishExplosion();
  }
}

function createGiftMarkup() {
  return `
    <span class="gift-lid"></span>
    <span class="gift-body"></span>
    <span class="gift-ribbon-v"></span>
    <span class="gift-ribbon-h"></span>
    <span class="gift-bow"></span>
  `;
}

function setDropAsGift(drop) {
  drop.kind = 'gift';
  drop.el.className = 'love-drop love-gift';
  drop.el.textContent = '';
  drop.el.innerHTML = createGiftMarkup();
  drop.el.onclick = (e) => {
    e.stopPropagation();
    openGiftAsPolaroid(drop);
  };
}

function setDropAsText(drop) {
  drop.kind = 'text';
  drop.el.className = 'love-drop';
  drop.el.innerHTML = '';
  drop.el.textContent = LOVE_RAIN_TEXT;
  drop.el.onclick = null;
}

function openGiftAsPolaroid(drop) {
  if (drop.kind !== 'gift') return;

  const photo = ALBUM_PHOTOS[Math.floor(Math.random() * ALBUM_PHOTOS.length)];
  triggerFlash();

  drop.kind = 'polaroid';
  drop.el.onclick = null;
  drop.el.className = 'love-drop love-polaroid';
  drop.el.innerHTML = `
    <span class="polaroid-card">
      <img src="${encodeURI(photo)}" alt="Nossa foto" />
      <span class="polaroid-caption">eu te amo</span>
    </span>
  `;

  drop.scale = 1;
  drop.speed = random(0.55, 1.15);
  drop.spin = random(-0.28, 0.28);
  drop.opacity = 1;
  drop.el.style.opacity = '1';
  drop.el.style.transform = `translate3d(${drop.x}px, ${drop.y}px, 0) scale(${drop.scale}) rotate(${drop.rotate}deg)`;
}

function createLoveDrop(startAbove = true) {
  const el = document.createElement('span');
  loveRainEl.appendChild(el);

  const drop = {
    el,
    kind: 'text',
    x: 0,
    y: 0,
    speed: 0,
    drift: 0,
    scale: 1,
    opacity: 1,
    rotate: 0,
    spin: 0,
  };

  resetLoveDrop(drop, startAbove);
  loveDrops.push(drop);
}

function resetLoveDrop(drop, startAbove) {
  const asGift = Math.random() < GIFT_CHANCE;

  if (asGift) {
    setDropAsGift(drop);
    drop.scale = random(0.9, 1.2);
    drop.speed = random(1.6, 3.2);
    drop.spin = random(-1.1, 1.1);
  } else {
    setDropAsText(drop);
    drop.scale = random(0.72, 1.05);
    drop.speed = random(2.2, 5.6);
    drop.spin = 0;
  }

  drop.drift = random(-0.04, 0.04);
  drop.opacity = asGift ? random(0.9, 1) : random(0.28, 0.95);
  drop.rotate = asGift ? random(-16, 16) : 0;
  drop.x = random(0, Math.max(width - 100, 1));
  drop.y = startAbove ? random(-height * 1.25, -20) : random(-160, -20);

  drop.el.style.opacity = '0';
  drop.el.style.transform = `translate3d(${drop.x}px, ${drop.y}px, 0) scale(${drop.scale}) rotate(${drop.rotate}deg)`;

  requestAnimationFrame(() => {
    drop.el.style.transition = 'opacity 0.7s ease';
    drop.el.style.opacity = String(drop.opacity);
  });
}

function startLoveRain() {
  if (rainStarted) return;
  rainStarted = true;
  loveRainEl.innerHTML = '';
  loveDrops = [];
  loveRainEl.classList.add('active');

  const isMobile = width <= 768;
  const base = Math.max(LOVE_RAIN_COUNT, Math.floor(width / (isMobile ? 14 : 18)));
  const count = isMobile ? Math.min(base, 58) : base;

  for (let i = 0; i < count; i++) {
    createLoveDrop(true);
  }
}

function updateLoveRain() {
  if (!rainStarted) return;

  for (const drop of loveDrops) {
    drop.y += drop.speed;
    drop.x += drop.drift;

    if (drop.kind === 'gift' || drop.kind === 'polaroid') {
      drop.rotate += drop.spin;
    }

    let fade = drop.opacity;
    if (drop.y < 40) fade *= drop.y / 40;
    if (drop.y > height - 60) fade *= Math.max(0, (height + 40 - drop.y) / 100);

    if (drop.y > height + 140) {
      drop.el.style.transition = 'none';
      resetLoveDrop(drop, false);
    } else {
      drop.el.style.opacity = String(Math.max(0, fade));
      drop.el.style.transform = `translate3d(${drop.x}px, ${drop.y}px, 0) scale(${drop.scale}) rotate(${drop.rotate}deg)`;
    }
  }
}

function startMessages() {
  if (messagesStarted) return;
  messagesStarted = true;
  phraseIndex = 0;

  messageEl.classList.remove('hidden');
  messageEl.classList.add('visible');
  cyclePhrase();
}

function stopMessages() {
  messagesStarted = false;
  phraseIndex = 0;
  clearPhraseTimeouts();

  messageEl.classList.remove('visible');
  messageEl.classList.add('hidden');
  messageTextEl.classList.remove('show', 'final', 'leaving');
  messageTextEl.textContent = '';
}

function onHeartFormed() {
  formedStartTime = performance.now();
  startMessages();
}

function drawParticle(p, now) {
  const alpha = (p.alpha ?? 1) * p.brightness;
  if (alpha <= 0.01) return;

  let glowBoost = 1;
  if (phase === 'formed') {
    const pulse = 0.92 + Math.sin((now - formedStartTime) * 0.0025 + p.x * 0.01) * 0.08;
    glowBoost = pulse;
  } else if (phase === 'forming') {
    glowBoost = 1.15;
  }

  if (p.trail && p.trail.length) {
    for (let i = 0; i < p.trail.length; i++) {
      const t = p.trail[i];
      const trailAlpha = (i / p.trail.length) * alpha * 0.28;
      ctx.beginPath();
      ctx.arc(t.x, t.y, p.radius * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 70, 70, ${trailAlpha})`;
      ctx.fill();
    }
  }

  const glowRadius = (p.radius + p.glow) * glowBoost;
  const gradient = ctx.createRadialGradient(p.x, p.y, p.radius * 0.4, p.x, p.y, glowRadius);
  gradient.addColorStop(0, `rgba(255, 90, 90, ${alpha * 0.55})`);
  gradient.addColorStop(0.45, `rgba(210, 35, 35, ${alpha * 0.22})`);
  gradient.addColorStop(1, 'rgba(120, 0, 0, 0)');

  ctx.beginPath();
  ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 70, 70, ${alpha})`;
  ctx.fill();
}

function drawShockwaves() {
  for (const wave of shockwaves) {
    ctx.beginPath();
    ctx.arc(wave.x, wave.y, wave.r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 80, 80, ${wave.alpha})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(wave.x, wave.y, wave.r * 0.86, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 160, 160, ${wave.alpha * 0.35})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function updateFloating(now) {
  if (now - pageStartTime >= FORMATION_DELAY) {
    startFormation();
    return;
  }

  for (const p of particles) {
    if (mouse.active) {
      const dx = p.x - mouse.x;
      const dy = p.y - mouse.y;
      const dist = Math.hypot(dx, dy);

      if (dist < REPULSION_RADIUS && dist > 0) {
        const strength = (1 - dist / REPULSION_RADIUS) ** 2;
        p.vx += (dx / dist) * strength * REPULSION_FORCE;
        p.vy += (dy / dist) * strength * REPULSION_FORCE;
      }
    }

    p.vx += (p.baseVx - p.vx) * 0.018;
    p.vy += (p.baseVy - p.vy) * 0.018;

    p.x += p.vx;
    p.y += p.vy;

    if (p.x < -20) p.x = width + 20;
    if (p.x > width + 20) p.x = -20;
    if (p.y < -20) p.y = height + 20;
    if (p.y > height + 20) p.y = -20;
  }
}

function updateForming(now) {
  const elapsed = now - formationStartTime;
  let allDone = true;

  for (const p of particles) {
    const localStart = p.delay * FORMATION_DURATION;
    const localDuration = FORMATION_DURATION * (1 - p.delay * 0.35);
    const raw = Math.min(Math.max((elapsed - localStart) / localDuration, 0), 1);
    const eased = easeOutQuint(raw);

    p.x = p.startX + (p.targetX - p.startX) * eased;
    p.y = p.startY + (p.targetY - p.startY) * eased;

    if (raw < 1) allDone = false;
  }

  if (allDone) {
    phase = 'formed';
    onHeartFormed();
  }
}

function updateFormed(now) {
  const breath = Math.sin((now - formedStartTime) * 0.0018) * 0.6;
  const { cx, cy } = getHeartLayout();

  for (const p of particles) {
    const dx = p.targetX - cx;
    const dy = p.targetY - cy;
    const dist = Math.hypot(dx, dy) || 1;
    p.x = p.targetX + (dx / dist) * breath;
    p.y = p.targetY + (dy / dist) * breath;
  }
}

function update(now) {
  if (phase === 'floating') {
    updateFloating(now);
  } else if (phase === 'forming') {
    updateForming(now);
  } else if (phase === 'formed') {
    updateFormed(now);
  } else if (phase === 'exploding') {
    updateExploding(now);
  } else if (phase === 'done') {
    updateLoveRain();
  }
}

function animate(now) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  if (phase === 'exploding') {
    drawShockwaves();
  }

  for (const p of particles) {
    if (p.alive === false) continue;
    drawParticle(p, now);
  }

  update(now);
  requestAnimationFrame(animate);
}

function setPointer(x, y, active = true) {
  if (phase !== 'floating') return;
  mouse.x = x;
  mouse.y = y;
  mouse.active = active;
}

window.addEventListener('mousemove', (e) => {
  setPointer(e.clientX, e.clientY, true);
});

window.addEventListener('mouseleave', () => {
  mouse.active = false;
});

window.addEventListener('touchstart', (e) => {
  if (!e.touches.length) return;
  const touch = e.touches[0];
  setPointer(touch.clientX, touch.clientY, true);
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (!e.touches.length) return;
  const touch = e.touches[0];
  setPointer(touch.clientX, touch.clientY, true);
}, { passive: true });

window.addEventListener('touchend', () => {
  mouse.active = false;
});

window.addEventListener('touchcancel', () => {
  mouse.active = false;
});

resize();
createParticles();
pageStartTime = performance.now();

window.addEventListener('resize', () => {
  resize();

  if (phase === 'floating') {
    createParticles();
    pageStartTime = performance.now();
    stopMessages();
    return;
  }

  if (phase === 'exploding' || phase === 'done') return;

  applyHeartTargets();
});

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    resize();
  });
}

requestAnimationFrame(animate);
