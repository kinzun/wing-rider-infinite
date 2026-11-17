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
  function clearInput() {
    Object.keys(input).forEach((k) => (input[k] = false));
  }
  window.addEventListener('keydown', (e) => {
    if (
      e.target instanceof HTMLInputElement ||
      (e.target instanceof HTMLButtonElement && ['Space', 'Enter'].includes(e.code))
    )
      return;
    if (keyMap[e.code]) {
      e.preventDefault();
      if (getState().status === 'playing') input[keyMap[e.code]] = true;
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
      input[keyMap[e.code]] = false;
      e.preventDefault();
    }
  });
  window.addEventListener('blur', () => {
    clearInput();
    if (getState().status === 'playing') pause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && getState().status === 'playing') pause();
  });

  return { input, clear: clearInput };
}
