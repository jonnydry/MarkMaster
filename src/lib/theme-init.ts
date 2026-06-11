/**
 * Theme initialization script (prevents FOUC on page load).
 * Served by src/app/theme-init/route.ts as an external script.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('markmaster-theme')||'dark';document.documentElement.classList.toggle('dark',t==='dark');var p=localStorage.getItem('markmaster-typography-preset');var f=localStorage.getItem('markmaster-font-mode');if(!/^(orbit|classic|editorial|mono)$/.test(p||''))p=f==='mono'?'mono':'orbit';document.documentElement.setAttribute('data-typography-preset',p);var c=localStorage.getItem('markmaster-color-theme');if(!c&&localStorage.getItem('markmaster-orbital')==='true')c='aurora';if(c&&c!=='horizon')document.documentElement.setAttribute('data-color-theme',c)}catch(e){document.documentElement.classList.add('dark');document.documentElement.setAttribute('data-typography-preset','orbit')}})()`;
