// Portfolio component: loads partial and adds filtering + details behavior
(function(){
  // Build absolute URL relative to current document origin
  function resolveUrl(path){
    if (!path) return '';
    try { return new URL(path, document.baseURI).href; }
    catch { return path; }
  }

  async function loadInto(id, url){
    const el = document.getElementById(id);
    if (!el) return;
    if (el.querySelector('#portfolio-grid')) {
      await wire(el);
      return;
    }
    try {
      const res = await fetch(resolveUrl(url));
      if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
      const html = await res.text();
      const tmp = document.createElement('div');
      tmp.innerHTML = html.trim();
      const sec = tmp.querySelector(`section#${id}`);
      el.innerHTML = sec ? sec.innerHTML : html;
      await wire(el);
    } catch (err) {
      console.warn('Portfolio load failed:', err);
    }
  }

  // Touch gesture parameters for mobile modal gallery navigation
  const SWIPE_MIN_DISTANCE_PX = 40;
  const SWIPE_MAX_DURATION_MS = 1000;
  const SWIPE_DOMINANCE_RATIO = 1.25;

  /**
   * Evaluates touch coordinates to determine if a valid horizontal swipe occurred.
   * Discards taps, multi-touch, vertical scrolls, and ambiguous diagonal gestures.
   *
   * @param {Object} params
   * @param {number} params.startX
   * @param {number} params.startY
   * @param {number} params.endX
   * @param {number} params.endY
   * @param {number} [params.startTime]
   * @param {number} [params.endTime]
   * @param {boolean} [params.isMultiTouch]
   * @returns {'next' | 'prev' | null}
   */
  function evaluateSwipeGesture({ startX, startY, endX, endY, startTime, endTime, isMultiTouch = false }) {
    if (isMultiTouch) return null;
    if (typeof startTime === 'number' && typeof endTime === 'number') {
      if (endTime - startTime > SWIPE_MAX_DURATION_MS) return null;
    }
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Require minimum horizontal movement threshold and horizontal dominance over vertical
    if (absX >= SWIPE_MIN_DISTANCE_PX && absX > absY * SWIPE_DOMINANCE_RATIO) {
      return deltaX < 0 ? 'next' : 'prev';
    }
    return null;
  }

  // NEW: helper to create one card element from a data item
  function createCard(item){
    const article = document.createElement('article');
    article.className = 'pf-card';
    article.tabIndex = 0;
    article.setAttribute('role', 'button');
    article.setAttribute('aria-haspopup', 'dialog');
    article.setAttribute('aria-label', `${item.title}. View project case study and images.`);

    // data-* used by filters and details pane
    article.dataset.project = item.project || 'fence';
    article.dataset.date = item.date || '2022';
    article.dataset.loc = item.loc || 'metro';
    article.dataset.title = item.title;
    article.dataset.tags = Array.isArray(item.tags) ? item.tags.join(' • ') : String(item.tags || '');
    article.dataset.desc = item.desc || '';

    // Media container with aspect ratio
    const mediaWrap = document.createElement('div');
    mediaWrap.className = 'pf-card__media';

    const img = document.createElement('img');
    img.className = 'pf-card__img';
    img.src = item.thumbUrl || 'images/cover.jpg';
    img.alt = item.imageAlt || `${item.title} perimeter security installation photo`;
    img.loading = 'lazy';
    img.decoding = 'async';
    mediaWrap.appendChild(img);

    // Subtle photo count badge if multi-photo
    const photoCount = Array.isArray(item.images) ? item.images.length : (item.thumbUrl ? 1 : 0);
    if (photoCount > 1) {
      const countBadge = document.createElement('span');
      countBadge.className = 'pf-card__count';
      countBadge.setAttribute('aria-hidden', 'true');
      countBadge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg> ${photoCount}`;
      mediaWrap.appendChild(countBadge);
    }

    const content = document.createElement('div');
    content.className = 'pf-card__content';

    const meta = document.createElement('div');
    meta.className = 'pf-card__meta';

    const categoryText = item.category || (item.project === 'fence' ? 'Electric Fence' : 'Perimeter Security');
    const locText = item.loc === 'metro' ? 'Metro Manila' : (item.loc === 'prov' ? 'Provincial' : '');

    const metaCat = document.createElement('span');
    metaCat.className = 'pf-card__cat';
    metaCat.textContent = categoryText;
    meta.appendChild(metaCat);

    if (locText) {
      const metaSep = document.createElement('span');
      metaSep.className = 'pf-card__sep';
      metaSep.textContent = '·';
      metaSep.setAttribute('aria-hidden', 'true');
      meta.appendChild(metaSep);

      const metaLoc = document.createElement('span');
      metaLoc.className = 'pf-card__loc';
      metaLoc.textContent = locText;
      meta.appendChild(metaLoc);
    }

    const h3 = document.createElement('h3');
    h3.className = 'pf-card__title';
    h3.textContent = item.title;

    const action = document.createElement('div');
    action.className = 'pf-card__action';
    action.innerHTML = `<span>View case</span><span class="pf-card__arrow" aria-hidden="true">→</span>`;

    content.appendChild(meta);
    content.appendChild(h3);
    content.appendChild(action);

    article.appendChild(mediaWrap);
    article.appendChild(content);

    return article;
  }

  // NEW: render a list of cards into the grid
  function renderCardsIntoGrid(items, grid){
    const frag = document.createDocumentFragment();
    items.forEach(item => frag.appendChild(createCard(item)));
    grid.innerHTML = ''; // clear any existing content
    grid.appendChild(frag);
  }

  async function wire(root){
    const grid = root.querySelector('.portfolio__grid');
    const pager = root.querySelector('.portfolio__pager');

    // Map cards to their data for modal usage
    const cardData = new WeakMap();

    // Modal creation
    let modal, modalDialog, modalTitle, modalSubmeta, modalImage, modalDesc, modalCounter, btnPrev, btnNext, btnClose, modalCta;
    let modalIndex = 0;
    let modalImages = [];
    let previouslyFocused = null;
    let currentItem = null;

    function ensureModal(){
      if (modal) return;
      modal = document.createElement('div');
      modal.className = 'pf-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'pf-modal-title');
      modal.setAttribute('aria-describedby', 'pf-modal-desc');
      modal.innerHTML = `
        <div class="pf-modal__dialog">
          <div class="pf-modal__header">
            <div class="pf-modal__title-wrap">
              <h3 class="pf-modal__title" id="pf-modal-title"></h3>
              <div class="pf-modal__submeta" id="pf-modal-submeta"></div>
            </div>
            <button class="pf-modal__close" aria-label="Close project modal">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          <div class="pf-modal__body">
            <div class="pf-carousel">
              <img alt="Project image" />
              <div class="pf-carousel__nav">
                <button class="pf-carousel__btn pf-carousel__prev" aria-label="Previous image">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <span class="pf-carousel__counter" aria-live="polite"></span>
                <button class="pf-carousel__btn pf-carousel__next" aria-label="Next image">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
                </button>
              </div>
            </div>
          </div>
          <div class="pf-modal__footer">
            <div class="pf-modal__details">
              <h4 class="pf-modal__section-heading">Project Overview</h4>
              <p class="pf-modal__desc" id="pf-modal-desc"></p>
            </div>
            <div class="pf-modal__inquiry">
              <a href="#contact" class="pf-modal__cta" id="pf-modal-cta">Request assessment for similar site</a>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modal);

      modalDialog = modal.querySelector('.pf-modal__dialog');
      modalTitle = modal.querySelector('.pf-modal__title');
      modalSubmeta = modal.querySelector('#pf-modal-submeta');
      modalImage = modal.querySelector('.pf-carousel img');
      modalCounter = modal.querySelector('.pf-carousel__counter');
      modalDesc = modal.querySelector('.pf-modal__desc');
      btnPrev = modal.querySelector('.pf-carousel__prev');
      btnNext = modal.querySelector('.pf-carousel__next');
      btnClose = modal.querySelector('.pf-modal__close');
      modalCta = modal.querySelector('#pf-modal-cta');

      const onBackdrop = (e) => { if (e.target === modal) closeModal(); };
      modal.addEventListener('click', onBackdrop);
      btnClose.addEventListener('click', () => closeModal());
      btnPrev.addEventListener('click', () => showImage(modalIndex - 1));
      btnNext.addEventListener('click', () => showImage(modalIndex + 1));

      if (modalCta) {
        modalCta.addEventListener('click', () => {
          closeModal();
        });
      }

      // Touch gesture support on the carousel container for mobile swipe navigation
      const carousel = modal.querySelector('.pf-carousel');
      let touchStartX = 0;
      let touchStartY = 0;
      let touchStartTime = 0;
      let touchIdentifier = null;
      let isTrackingTouch = false;

      function onTouchStart(e) {
        if (!modal || !modal.classList.contains('is-open')) return;
        if (modalImages.length <= 1) return;
        // Ignore multi-touch (e.g. pinch-to-zoom)
        if (e.touches.length !== 1) {
          isTrackingTouch = false;
          touchIdentifier = null;
          return;
        }
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartTime = Date.now();
        touchIdentifier = touch.identifier;
        isTrackingTouch = true;
      }

      function onTouchMove(e) {
        if (!isTrackingTouch) return;
        // Multi-touch gestures abort swipe tracking
        if (e.touches.length !== 1) {
          isTrackingTouch = false;
          touchIdentifier = null;
        }
      }

      function onTouchEnd(e) {
        if (!isTrackingTouch) return;
        isTrackingTouch = false;

        let matchingTouch = null;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === touchIdentifier) {
            matchingTouch = e.changedTouches[i];
            break;
          }
        }
        touchIdentifier = null;
        if (!matchingTouch) return;

        const gesture = evaluateSwipeGesture({
          startX: touchStartX,
          startY: touchStartY,
          endX: matchingTouch.clientX,
          endY: matchingTouch.clientY,
          startTime: touchStartTime,
          endTime: Date.now(),
        });

        if (gesture === 'next') {
          showImage(modalIndex + 1);
        } else if (gesture === 'prev') {
          showImage(modalIndex - 1);
        }
      }

      function onTouchCancel() {
        isTrackingTouch = false;
        touchIdentifier = null;
      }

      if (carousel) {
        carousel.addEventListener('touchstart', onTouchStart, { passive: true });
        carousel.addEventListener('touchmove', onTouchMove, { passive: true });
        carousel.addEventListener('touchend', onTouchEnd, { passive: true });
        carousel.addEventListener('touchcancel', onTouchCancel, { passive: true });
      }

      window.addEventListener('keydown', (e) => {
        if (!modal || !modal.classList.contains('is-open')) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          closeModal();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          showImage(modalIndex - 1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          showImage(modalIndex + 1);
        } else if (e.key === 'Tab') {
          // Trap focus inside modal: filter to visible focusable elements only
          const focusables = Array.from(modal.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href]'))
            .filter(el => el.offsetParent !== null || el.getClientRects().length > 0);
          if (!focusables.length) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      });
    }

    function setBackgroundInert(isInert) {
      const targets = [
        document.getElementById('navbar'),
        document.getElementById('hero'),
        document.getElementById('main-content'),
        document.getElementById('footer')
      ];
      targets.forEach(el => {
        if (!el) return;
        if (isInert) {
          el.setAttribute('aria-hidden', 'true');
          if ('inert' in el) el.inert = true;
        } else {
          el.removeAttribute('aria-hidden');
          if ('inert' in el) el.inert = false;
        }
      });
    }

    function normalizeImages(item){
      const arr = Array.isArray(item.images) ? item.images : [];
      if (arr.length > 0) {
        return arr.map(v => typeof v === 'string' ? { src: v, alt: item.title } : v);
      }
      // Fallback to thumb
      if (item.thumbUrl) return [{ src: item.thumbUrl, alt: item.imageAlt || item.title }];
      return [{ src: 'images/cover.jpg', alt: item.title }];
    }

    function showImage(i){
      if (!modalImages.length) return;
      modalIndex = (i + modalImages.length) % modalImages.length;
      const { src, alt } = modalImages[modalIndex];
      modalImage.src = src;
      const title = (currentItem && currentItem.title) || 'Perimeter security project';
      modalImage.alt = (alt && alt !== 'Image ' + (modalIndex + 1)) ? alt : `${title} - Installation photo ${modalIndex + 1} of ${modalImages.length}`;

      if (modalCounter) {
        modalCounter.textContent = `${modalIndex + 1} / ${modalImages.length}`;
        modalCounter.style.display = modalImages.length > 1 ? '' : 'none';
      }
      if (btnPrev && btnNext) {
        const showNav = modalImages.length > 1;
        btnPrev.style.display = showNav ? '' : 'none';
        btnNext.style.display = showNav ? '' : 'none';
      }
    }

    function openModal(item){
      ensureModal();
      previouslyFocused = document.activeElement;
      currentItem = item;
      modalImages = normalizeImages(item);
      modalIndex = 0;
      modalTitle.textContent = item.title || 'Project';

      const cat = item.category || (item.project === 'fence' ? 'Electric Fence' : 'Perimeter Security');
      const loc = item.loc === 'metro' ? 'Metro Manila' : (item.loc === 'prov' ? 'Provincial' : '');
      const year = item.date || '';
      const metaParts = [cat, loc, year].filter(Boolean);
      if (modalSubmeta) {
        modalSubmeta.textContent = metaParts.join(' · ');
      }

      modalDesc.textContent = item.desc || 'No further description available.';
      showImage(0);
      modal.classList.add('is-open');
      document.body.classList.add('pf-modal-open');
      setBackgroundInert(true);
      // Focus close button inside dialog
      btnClose.focus();
    }

    function closeModal(){
      if (!modal) return;
      modal.classList.remove('is-open');
      document.body.classList.remove('pf-modal-open');
      setBackgroundInert(false);
      currentItem = null;
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    }

    // Filtering via selects
    const selProject = root.querySelector('#pfProject');
    const selDate = root.querySelector('#pfDate');
    const selLoc = root.querySelector('#pfLocation');
    const btnSort = root.querySelector('#pfSort');

    // Pagination state
    const PAGE_SIZE_MOBILE = 4;
    const PAGE_SIZE_DESKTOP = 6;
    let page = 1;
    // Sort state: 'desc' (newest first) or 'asc' (oldest first)
    let sortDir = 'desc';

    function pageSize(){ return matchMedia('(min-width: 768px)').matches ? PAGE_SIZE_DESKTOP : PAGE_SIZE_MOBILE; }

    // Parse date from data-date; supports YYYY, YYYY-MM, YYYY-MM-DD
    function dateToKey(s){
      if (!s) return 0;
      const parts = String(s).split('-');
      const y = parts[0] || '0000';
      const m = (parts[1] || '01').padStart(2,'0');
      const d = (parts[2] || '01').padStart(2,'0');
      return Number(`${y}${m}${d}`);
    }

    function applySort(){
      const cards = Array.from(grid.querySelectorAll('.pf-card'));
      cards.sort((a,b) => {
        const ak = dateToKey(a.dataset.date);
        const bk = dateToKey(b.dataset.date);
        return sortDir === 'desc' ? (bk - ak) : (ak - bk);
      });
      // Re-append in sorted order
      const frag = document.createDocumentFragment();
      cards.forEach(c => frag.appendChild(c));
      grid.appendChild(frag);
    }

    function filteredCards(){
      const all = Array.from(grid.querySelectorAll('.pf-card'));
      const proj = selProject ? selProject.value : 'all';
      const yr = selDate ? selDate.value : 'all';
      const loc = selLoc ? selLoc.value : 'all';
      return all.filter(c => {
        const okProj = proj === 'all' || (c.dataset.project === proj);
        const okYear = yr === 'all' || ((c.dataset.date || '').startsWith(yr));
        const okLoc = loc === 'all' || (c.dataset.loc === loc);
        return okProj && okYear && okLoc;
      });
    }

    function renderPage(){
      const cards = filteredCards();
      const size = pageSize();
      const total = cards.length;
      const pages = Math.max(1, Math.ceil(total / size));
      if (page > pages) page = pages;

      // Hide all, then show current slice
      grid.querySelectorAll('.pf-card').forEach(c => c.style.display = 'none');
      const start = (page - 1) * size;
      const slice = cards.slice(start, start + size);
      slice.forEach(c => c.style.display = '');

      // Empty state
      let empty = root.querySelector('.pf-empty');
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'pf-empty';
        empty.setAttribute('role', 'status');
        empty.setAttribute('aria-live', 'polite');
        empty.innerHTML = `
          <p class="pf-empty__text">No projects match the selected filters.</p>
          <button type="button" class="pf-empty__reset">Reset filters</button>
        `;
        const resetBtn = empty.querySelector('.pf-empty__reset');
        if (resetBtn) {
          resetBtn.addEventListener('click', () => {
            if (selProject) selProject.value = 'all';
            if (selDate) selDate.value = 'all';
            if (selLoc) selLoc.value = 'all';
            page = 1;
            renderPage();
          });
        }
        grid.parentElement.insertBefore(empty, grid.nextSibling);
      }
      empty.style.display = slice.length === 0 ? 'flex' : 'none';

      // Build pager
      if (pager) {
        pager.innerHTML = '';
        if (pages <= 1) {
          pager.style.display = 'none';
        } else {
          pager.style.display = 'flex';
          const addBtn = (label, targetPage, isCurrent=false) => {
            const b = document.createElement('button');
            b.className = 'pager-btn';
            b.textContent = label;
            b.setAttribute('aria-label', `Page ${label}`);
            if (isCurrent) b.setAttribute('aria-current', 'page');
            b.disabled = isCurrent;
            b.addEventListener('click', () => { page = targetPage; renderPage(); });
            pager.appendChild(b);
          };

          // Prev
          const prev = document.createElement('button');
          prev.className = 'pager-btn';
          prev.textContent = 'Prev';
          prev.disabled = page <= 1;
          prev.setAttribute('aria-label', 'Previous page');
          prev.addEventListener('click', () => { if (page > 1) { page--; renderPage(); } });
          pager.appendChild(prev);

          for (let i=1;i<=pages;i++) addBtn(String(i), i, i===page);

          // Next
          const next = document.createElement('button');
          next.className = 'pager-btn';
          next.textContent = 'Next';
          next.disabled = page >= pages;
          next.setAttribute('aria-label', 'Next page');
          next.addEventListener('click', () => { if (page < pages) { page++; renderPage(); } });
          pager.appendChild(next);
        }
      }
    }

    // Filtering (selects) -> reset to page 1
    function onFilterChange(){ page = 1; renderPage(); }
    if (selProject) selProject.addEventListener('change', onFilterChange);
    if (selDate) selDate.addEventListener('change', onFilterChange);
    if (selLoc) selLoc.addEventListener('change', onFilterChange);

    // Sorting toggle
    if (btnSort) {
      const updateBtn = () => {
        const textSpan = btnSort.querySelector('.pf-sort-text');
        const textLabel = sortDir === 'desc' ? 'Sort: Newest' : 'Sort: Oldest';
        if (textSpan) {
          textSpan.textContent = textLabel;
        } else {
          btnSort.textContent = textLabel;
        }
        btnSort.setAttribute('aria-pressed', sortDir === 'desc' ? 'true' : 'false');
      };
      updateBtn();
      btnSort.addEventListener('click', () => {
        sortDir = sortDir === 'desc' ? 'asc' : 'desc';
        updateBtn();
        applySort();
        page = 1; // reset pagination after sort change
        renderPage();
      });
    }

    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.pf-card');
      if (card) {
        const item = cardData.get(card);
        if (item) openModal(item);
      }
    });
    grid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.pf-card');
        if (card) { e.preventDefault(); const item = cardData.get(card); if (item) openModal(item); }
      }
    });

    // Debounce resize listener to adapt page size smoothly
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        renderPage();
        resizeTimer = null;
      }, 100);
    }, { passive: true });

    // Fetch data and paint cards before initial render
    try {
      const dataRes = await fetch(resolveUrl('portfolio-data.json'));
      if (!dataRes.ok) throw new Error(`Failed to fetch dataset: ${dataRes.status}`);
      const items = await dataRes.json();
      renderCardsIntoGrid(items, grid);
      // Map each card element to its source data for modal
      const cards = Array.from(grid.querySelectorAll('.pf-card'));
      cards.forEach((card, idx) => { cardData.set(card, items[idx]); });
      // Default sort: newest first
      applySort();
    } catch (err) {
      console.error(err);
      // Optional: simple failure fallback
      grid.innerHTML = '<p style="opacity:.8">Failed to load projects.</p>';
    }

    // Initial render (after cards exist)
    renderPage();
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function(){
      loadInto('portfolio', 'portfolio.html');
    });
  }

  const PortfolioExport = {
    loadInto,
    createCard,
    renderCardsIntoGrid,
    evaluateSwipeGesture,
    SWIPE_MIN_DISTANCE_PX,
    SWIPE_MAX_DURATION_MS,
    SWIPE_DOMINANCE_RATIO,
  };

  if (typeof window !== 'undefined') {
    window.Portfolio = PortfolioExport;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.Portfolio = PortfolioExport;
  }
})();
