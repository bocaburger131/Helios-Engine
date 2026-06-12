/**
 * Collapsible sidebar toggle — shared across Helios pages.
 */
(function (global) {
  const STORAGE_KEY = 'helios_sidebar_collapsed';

  function isCollapsed() {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  }

  function applyState(collapsed) {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    const btn = document.getElementById('helios-sidebar-toggle');
    if (btn) {
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      btn.textContent = collapsed ? '☰' : '‹';
    }
  }

  function init() {
    const btn = document.getElementById('helios-sidebar-toggle');
    if (!btn) return;
    applyState(isCollapsed());
    btn.addEventListener('click', () => {
      const next = !document.body.classList.contains('sidebar-collapsed');
      localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false');
      applyState(next);
    });
  }

  global.HeliosSidebar = { init, isCollapsed, applyState };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
