/**
 * Theme initialization script (prevents FOUC on page load).
 * This must be kept in sync with the hash computed in next.config.ts.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('markmaster-theme')||'dark';document.documentElement.classList.toggle('dark',t==='dark');var f=localStorage.getItem('markmaster-font-mode')||'default';if(f==='mono')document.documentElement.setAttribute('data-font-mode','mono');var o=localStorage.getItem('markmaster-orbital')==='true';if(o){document.documentElement.setAttribute('data-theme','orbital');document.documentElement.classList.add('theme-orbital')}}catch(e){document.documentElement.classList.add('dark')}})()`;