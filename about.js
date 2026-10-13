// Loads about.html and injects it into #about
(function(){
  async function loadInto(id, url){
    try {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.querySelector('.about')) return;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch ' + url);
      const html = await res.text();
      const tmp = document.createElement('div');
      tmp.innerHTML = html.trim();
      const sec = tmp.querySelector(`section#${id}`);
      el.innerHTML = sec ? sec.innerHTML : html;
    } catch(err) {
      // minimal fallback
      console.warn('About load failed:', err);
    }
  }

  document.addEventListener('DOMContentLoaded', function(){
    loadInto('about', 'about.html');
  });

  window.About = { loadInto };
})();
