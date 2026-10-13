// Simple navbar with menu toggle, active link tracking, and theme toggle
(function () {
  const html = `
    <nav class="nav" aria-label="Primary navigation">
      <div class="nav__inner">
        <a href="#hero" class="nav__brand">
          <img class="nav__brand-logo" src="images/logo.jpg" width="28" height="28" alt="SEIA Logo" />
          <span>SEIA</span>
        </a>

        <ul class="nav__menu" id="nav-menu">
          <li><a class="nav__link" href="#hero">Home</a></li>
          <li><a class="nav__link" href="#about">About</a></li>
          <li><a class="nav__link" href="#portfolio">Portfolio</a></li>
          <li><a class="nav__link" href="#contact">Contact</a></li>
        </ul>

        <div class="nav__controls">
          <button class="nav__toggle" aria-label="Open navigation menu" aria-expanded="false" aria-controls="nav-menu">
            <span></span><span></span><span></span>
          </button>
          <button class="nav__theme-btn" aria-label="Switch to dark theme" title="Switch to dark theme">🌙</button>
        </div>
      </div>
    </nav>
  `;

  function mount(target) {
    if (!target) return;
    if (!target.querySelector('.nav')) {
      target.innerHTML = html;
    }

    const toggle = target.querySelector('.nav__toggle');
    const menu = target.querySelector('#nav-menu');
    const themeBtn = target.querySelector('.nav__theme-btn');
    const navLinks = Array.from(target.querySelectorAll('.nav__link'));
    const root = document.documentElement;

    function closeMenu(focusToggle = false) {
      if (toggle.getAttribute('aria-expanded') === 'true') {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open navigation menu');
        menu.classList.remove('open');
        if (focusToggle) toggle.focus();
      }
    }

    // Menu toggle
    toggle.addEventListener('click', () => {
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      const nextOpen = !isOpen;
      toggle.setAttribute('aria-expanded', String(nextOpen));
      toggle.setAttribute('aria-label', nextOpen ? 'Close navigation menu' : 'Open navigation menu');
      menu.classList.toggle('open', nextOpen);
    });

    // Close menu on link click
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        closeMenu(false);
      });
    });

    // Close on Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        closeMenu(true);
      }
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (toggle.getAttribute('aria-expanded') === 'true' && !target.contains(e.target)) {
        closeMenu(false);
      }
    });

    // Active navigation state observer
    const sectionIds = ['hero', 'about', 'portfolio', 'contact'];
    function updateActiveNav() {
      const scrollPos = window.scrollY + 100;
      let currentId = '';
      for (const id of sectionIds) {
        const sec = document.getElementById(id);
        if (sec) {
          const top = sec.offsetTop;
          const height = sec.offsetHeight;
          if (scrollPos >= top && scrollPos < top + height) {
            currentId = `#${id}`;
          }
        }
      }
      navLinks.forEach(link => {
        const href = link.getAttribute('href');
        const isActive = href === currentId;
        link.classList.toggle('active', isActive);
        if (isActive) {
          link.setAttribute('aria-current', 'location');
        } else {
          link.removeAttribute('aria-current');
        }
      });
    }

    // Throttled scroll listener via requestAnimationFrame to avoid layout thrashing
    let scrollRafId = null;
    function onScroll() {
      if (scrollRafId !== null) return;
      scrollRafId = requestAnimationFrame(() => {
        updateActiveNav();
        scrollRafId = null;
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('hashchange', updateActiveNav);
    setTimeout(updateActiveNav, 300);

    // Theme toggle
    const storageKey = 'theme';
    function getTheme() {
      const saved = localStorage.getItem(storageKey);
      if (saved) return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function setTheme(theme) {
      const t = theme === 'dark' ? 'dark' : 'light';
      root.setAttribute('data-theme', t);
      themeBtn.textContent = t === 'dark' ? '☀️' : '🌙';
      const label = t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
      themeBtn.setAttribute('aria-label', label);
      themeBtn.setAttribute('title', label);
      localStorage.setItem(storageKey, t);
    }

    setTheme(getTheme());
    themeBtn.addEventListener('click', () => {
      const current = root.getAttribute('data-theme');
      setTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const slot = document.getElementById('navbar');
    if (slot) mount(slot);
  });

  window.LightNav = { mount };
})();
