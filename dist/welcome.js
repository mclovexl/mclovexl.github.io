/* Show a brief welcome on arrival; no saved data or network requests involved. */
(function () {
  'use strict';
  const screen = document.getElementById('welcome-screen');
  const skip = document.getElementById('welcome-skip');
  if (!screen || !skip || typeof screen.showModal !== 'function') return;

  // Treat the ordinary lunar tenth month as her birthday, using Beijing's day.
  const now = Date.now();
  const beijingDate = new Date(now + 8 * 60 * 60 * 1000);
  function isLunarBirthday() {
    try {
      const formatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
        timeZone: 'Asia/Shanghai', numberingSystem: 'latn', month: 'numeric', day: 'numeric'
      });
      if (formatter.resolvedOptions().calendar === 'chinese' && typeof formatter.formatToParts === 'function') {
        const parts = formatter.formatToParts(new Date(now));
        const month = parts.find(part => part.type === 'month')?.value;
        const day = parts.find(part => part.type === 'day')?.value;
        if (/^(?:闰)?\d+$/.test(month || '') && /^\d+$/.test(day || '')) return month === '10' && day === '4';
      }
    } catch (_) { /* Some older browsers lack the Chinese calendar. */ }

    // Offline fallback for browsers without a Chinese calendar (2026–2100).
    const dates = [
      1112,1101,1119,1109,1030,1118,1106,1026,1114,1103,1121,1110,1031,1119,1108,
      1028,1116,1105,1122,1112,1101,1120,1109,1030,1117,1106,1124,1113,1103,1122,
      1110,1031,1119,1108,1027,1115,1104,1123,1112,1101,1120,1110,1029,1117,1106,
      1125,1113,1103,1122,1111,1031,1119,1108,1028,1114,1104,1123,1113,1101,1120,
      1109,1029,1116,1105,1124,1114,1103,1122,1111,1031,1118,1107,1027,1115,1105
    ];
    const index = beijingDate.getUTCFullYear() - 2026;
    return dates[index] === (beijingDate.getUTCMonth() + 1) * 100 + beijingDate.getUTCDate();
  }
  const birthdayScene = screen.querySelector('.birthday-scene');
  const birthday = birthdayScene && isLunarBirthday();
  if (birthday) {
    screen.classList.add('is-birthday');
    screen.setAttribute('aria-labelledby', 'birthday-title');
    screen.querySelector('.welcome-content').hidden = true;
    screen.querySelector('.welcome-date').hidden = true;
    birthdayScene.hidden = false;
    screen.querySelector('.birthday-date').hidden = false;
  }

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
  autoTimer = setTimeout(dismiss, birthday ? 8500 : reducedMotion ? 1600 : 5400);
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
