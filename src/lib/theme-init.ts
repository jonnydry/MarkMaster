/**
 * Theme initialization script (prevents FOUC on page load).
 * This must be kept in sync with the hash computed in next.config.ts.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('markmaster-theme')||'dark';document.documentElement.classList.toggle('dark',t==='dark')}catch(e){document.documentElement.classList.add('dark')}})()`;