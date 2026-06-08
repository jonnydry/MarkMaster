/**
 * Theme initialization script (prevents FOUC on page load).
 * This must be kept in sync with the hash computed in next.config.ts.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('markmaster-theme')||'dark';document.documentElement.classList.toggle('dark',t==='dark');var f=localStorage.getItem('markmaster-font-mode')||'default';if(f==='mono')document.documentElement.setAttribute('data-font-mode','mono');var c=localStorage.getItem('markmaster-color-theme');if(!c&&localStorage.getItem('markmaster-orbital')==='true')c='aurora';if(c&&c!=='horizon')document.documentElement.setAttribute('data-color-theme',c)}catch(e){document.documentElement.classList.add('dark')}})()`;
