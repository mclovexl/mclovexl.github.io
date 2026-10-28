/* Show a brief welcome on arrival; no saved data or network requests involved. */
(function () {
  'use strict';
  const screen = document.getElementById('welcome-screen');
  const skip = document.getElementById('welcome-skip');
  if (!screen || !skip || typeof screen.showModal !== 'function') return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let leaving = false;
  let autoTimer;
  let closeTimer;
  function finish() {
    clearTimeout(autoTimer);
    clearTimeout(closeTimer);
    document.body.classList.remove('welcome-active');
    if (screen.open) screen.close();
    if (!document.querySelector('dialog[open]')) {
      const home = document.querySelector('.site-header .brand');
      if (home) home.focus({ preventScroll: true });
    }
  }
  function dismiss() {
    if (leaving) return;
    leaving = true;
    screen.classList.add('welcome-leaving');
    closeTimer = setTimeout(finish, reducedMotion ? 0 : 900);
  }
  skip.addEventListener('click', dismiss);
  screen.addEventListener('cancel', (event) => { event.preventDefault(); dismiss(); });
  screen.addEventListener('close', () => {
    clearTimeout(autoTimer);
    clearTimeout(closeTimer);
    document.body.classList.remove('welcome-active');
  });

  // Start the escape hatch before showing the modal, even on a slow connection.
  autoTimer = setTimeout(dismiss, reducedMotion ? 1600 : 5400);
  try {
    screen.showModal();
    document.body.classList.add('welcome-active');
    const stars = screen.querySelector('.welcome-stars');
    if (!stars) return;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 44; i++) {
      const star = document.createElement('i');
      star.style.setProperty('--x', `${(i * 37.7 + 5) % 100}%`);
      star.style.setProperty('--y', `${(i * 23.3 + 9) % 100}%`);
      star.style.setProperty('--size', `${i % 9 === 0 ? 3 : i % 3 === 0 ? 2 : 1}px`);
      star.style.setProperty('--duration', `${2 + (i % 5) * .7}s`);
      star.style.setProperty('--delay', `${-(i % 7) * .5}s`);
      fragment.append(star);
    }
    stars.append(fragment);
  } catch (_) {
    finish();
  }
})();
