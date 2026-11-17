function createControls({ getState, start, pause, toggleSound }) {
  const input = {
    forward: false,
    back: false,
    left: false,
    right: false,
    brake: false,
    boost: false,
    jump: false,
    tier1: false,
    tier2: false,
    tier3: false,
    fire: false,
    roar: false,
    pelican: false,
  };
  const keyMap = {
    KeyW: 'forward',
    ArrowUp: 'forward',
    KeyS: 'back',
    ArrowDown: 'back',
    KeyA: 'left',
    ArrowLeft: 'left',
    KeyD: 'right',
    ArrowRight: 'right',
    Space: 'jump',
    ShiftLeft: 'boost',
    ShiftRight: 'boost',
    Digit1: 'tier1',
    Digit2: 'tier2',
    Digit3: 'tier3',
    Digit4: 'pelican',
    KeyZ: 'fire',
    KeyC: 'roar',
    KeyQ: 'six0',
    KeyE: 'six1',
    KeyR: 'six2',
    KeyF: 'six3',
    KeyV: 'six4',
    KeyX: 'six5',
  };
  const actions = [...new Set(Object.values(keyMap)), 'brake'];
  const keys = new Set();
  const pointers = new Map();
  const freshFire = new Set();
  const taps = new Map();
  const pulse = new Set();
  function sample() {
    for (const action of actions) input[action] = false;
    for (const code of keys) input[keyMap[code]] = true;
    for (const action of pointers.values()) input[action] = true;
    freshFire.clear();
    for (const [action, count] of taps) {
      if (pulse.delete(action)) continue;
      input[action] = true;
      pulse.add(action);
      if (count === 1) taps.delete(action);
      else taps.set(action, count - 1);
    }
    for (const action of pulse) if (!taps.has(action) && !input[action]) pulse.delete(action);
  }
  function bind(button, action, hold = false) {
    button.addEventListener('click', (e) => {
      if (e.detail === 0 && getState().status === 'playing' && !button.disabled)
        taps.set(action, Math.min(4, (taps.get(action) || 0) + 1));
    });
    button.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || getState().status !== 'playing' || button.disabled) return;
      e.preventDefault();
      if (!hold) {
        taps.set(action, Math.min(4, (taps.get(action) || 0) + 1));
        return;
      }
      pointers.set(e.pointerId, action);
      if (action === 'fire') freshFire.add(e.pointerId);
      button.setPointerCapture(e.pointerId);
      button.classList.add('held');
    });
    function release(e) {
      if (!pointers.delete(e.pointerId)) return;
      if (freshFire.delete(e.pointerId) && e.type === 'pointerup') taps.set('fire', 1);
      if (![...pointers.values()].includes(action)) button.classList.remove('held');
    }
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
      button.addEventListener(event, release);
    button.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      const r = button.getBoundingClientRect();
      if (
        e.clientX < r.left - 12 ||
        e.clientX > r.right + 12 ||
        e.clientY < r.top - 12 ||
        e.clientY > r.bottom + 12
      )
        release(e);
    });
  }
  function clearInput() {
    keys.clear();
    pointers.clear();
    freshFire.clear();
    taps.clear();
    pulse.clear();
    document.querySelectorAll('.held').forEach((button) => button.classList.remove('held'));
    for (const action of actions) input[action] = false;
  }
  window.addEventListener('keydown', (e) => {
    if (
      e.target instanceof HTMLInputElement ||
      (e.target instanceof HTMLButtonElement && ['Space', 'Enter'].includes(e.code))
    )
      return;
    if (keyMap[e.code]) {
      e.preventDefault();
      if (getState().status === 'playing') keys.add(e.code);
    }
    if (!e.repeat) {
      if (e.code === 'KeyM') toggleSound();
      if (e.code === 'Enter' && (getState().status === 'ready' || getState().status === 'lost'))
        start();
      if (e.code === 'KeyP' || e.code === 'Escape') pause();
      if (e.code === 'Backspace' && getState().status !== 'ready') start();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (keyMap[e.code]) {
      keys.delete(e.code);
      e.preventDefault();
    }
  });
  window.addEventListener('blur', () => {
    clearInput();
    if (getState().status === 'playing') pause();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    clearInput();
    if (getState().status === 'playing') pause();
  });

  return { input, clear: clearInput, bind, sample };
}
