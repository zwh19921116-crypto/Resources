/** Shared icon sprite, injected once so every page can use <use href="#i-name">. */
document.write(`
<svg class="sprite" aria-hidden="true" focusable="false">
  <symbol id="i-question" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9"/>
    <path d="M9.4 9.6a2.6 2.6 0 1 1 3.3 2.5c-.6.2-1 .8-1 1.4v.4"/>
    <circle cx="11.7" cy="17" r=".95" fill="currentColor" stroke="none"/>
  </symbol>
  <symbol id="i-doc" viewBox="0 0 24 24">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>
    <path d="M14 3v5h5M9 13h6M9 17h4"/>
  </symbol>
  <symbol id="i-checklist" viewBox="0 0 24 24">
    <rect x="4" y="5" width="16" height="16" rx="2.5"/>
    <path d="M9 3h6v3.2H9z"/>
    <path d="M8.4 13.4l2 2 4-4.2"/>
  </symbol>
  <symbol id="i-book" viewBox="0 0 24 24">
    <path d="M3 5.6A2.6 2.6 0 0 1 5.6 3H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H3z"/>
    <path d="M21 5.6A2.6 2.6 0 0 0 18.4 3H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z"/>
  </symbol>
  <symbol id="i-tap" viewBox="0 0 24 24">
    <path d="M7.5 3.4l10.4 6.4-4.4 1.3 2.4 4.6-2.5 1.3-2.4-4.6-3.5 3z" fill="currentColor" stroke="none"/>
  </symbol>
  <symbol id="i-monitor" viewBox="0 0 24 24">
    <rect x="3" y="4.5" width="18" height="12" rx="2"/>
    <path d="M8.5 20.5h7M12 16.5v4"/>
  </symbol>
  <symbol id="i-bookmark" viewBox="0 0 24 24">
    <path d="M7 3.5h10a1 1 0 0 1 1 1v16l-6-4.2-6 4.2v-16a1 1 0 0 1 1-1z"/>
  </symbol>
  <symbol id="i-search" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>
  </symbol>
  <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
  <symbol id="i-chevron" viewBox="0 0 24 24"><path d="M9.5 5.5l6.5 6.5-6.5 6.5"/></symbol>
  <symbol id="i-bars" viewBox="0 0 24 24">
    <g fill="currentColor" stroke="none">
      <rect x="3.5" y="14" width="4" height="7" rx="1.3"/>
      <rect x="10" y="9.5" width="4" height="11.5" rx="1.3"/>
      <rect x="16.5" y="5" width="4" height="16" rx="1.3"/>
    </g>
  </symbol>
  <symbol id="i-play" viewBox="0 0 24 24">
    <path d="M8 5.2l11 6.8-11 6.8z" fill="currentColor" stroke="none"/>
  </symbol>
  <symbol id="i-spark" viewBox="0 0 24 24">
    <path d="M12 3l2.1 5.4L19.5 10l-5.4 2.1L12 17.5l-2.1-5.4L4.5 10l5.4-1.6z" fill="currentColor" stroke="none"/>
  </symbol>
  <symbol id="i-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>
  <symbol id="i-gift" viewBox="0 0 24 24"><path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7H8.5a2.5 2.5 0 1 1 2.5-2.5L12 7zM12 7h3.5A2.5 2.5 0 1 0 13 4.5L12 7z"/></symbol>
  <symbol id="i-tag" viewBox="0 0 24 24"><path d="M4 5v6l9 9 7-7-9-9H4z"/><circle cx="8" cy="8" r="1.2"/></symbol>
  <symbol id="i-calendar" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16"/></symbol>
  <symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 21s6-5.5 6-11a6 6 0 1 0-12 0c0 5.5 6 11 6 11z"/><circle cx="12" cy="10" r="2"/></symbol>
  <symbol id="i-copy" viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/></symbol>
  <symbol id="i-qr" viewBox="0 0 24 24"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/></symbol>
</svg>`);
