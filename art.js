/**
 * Thumbnail illustrations, shared by the website and the admin preview.
 * Keys here must match the artStyles list in data/config.js.
 */
window.EDG_ART = {

  maths: `
    <rect width="300" height="180" fill="#eef0fb"/>
    <g stroke="#c3cbe8" stroke-width="1.4" fill="none" opacity=".85">
      <path d="M22 46h34M39 29v34"/>
      <path d="M96 40l26 26M122 40l-26 26"/>
      <path d="M168 36c14 0 14 30 28 30"/>
      <path d="M228 32v34M222 66h48M258 30l-16 40"/>
      <path d="M28 104h56M28 118h34"/>
      <path d="M118 96l22 34M140 96l-22 34"/>
      <path d="M186 100h48M186 116h30"/>
      <path d="M256 96v36M248 132h30"/>
      <path d="M40 150h70M150 150h40M214 150h52"/>
    </g>
    <g fill="#aeb9de" opacity=".9">
      <circle cx="170" cy="78" r="3"/><circle cx="92" cy="152" r="3"/><circle cx="274" cy="64" r="3"/>
    </g>`,

  exam: `
    <rect width="300" height="180" fill="#e8e2d8"/>
    <rect x="22" y="14" width="196" height="170" rx="6" fill="#fbf9f5" transform="rotate(-4 120 99)"/>
    <g stroke="#d5cec2" stroke-width="3" stroke-linecap="round" transform="rotate(-4 120 99)">
      <path d="M40 46h150M40 66h150M40 86h120M40 106h150M40 126h100M40 146h140"/>
    </g>
    <g transform="rotate(28 232 96)">
      <rect x="222" y="36" width="18" height="120" rx="4" fill="#f0c46a"/>
      <path d="M222 36l9-22 9 22z" fill="#e8b45a"/>
      <path d="M226 20l5-6 5 6z" fill="#3f3a33"/>
      <rect x="222" y="150" width="18" height="14" rx="3" fill="#e07a6a"/>
    </g>`,

  leaf: `
    <defs>
      <linearGradient id="leafBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#bfe89a"/><stop offset="1" stop-color="#3f8f37"/>
      </linearGradient>
    </defs>
    <rect width="300" height="180" fill="url(#leafBg)"/>
    <g opacity=".35" fill="#ffffff">
      <path d="M0 0h70L0 92z"/><circle cx="250" cy="32" r="26"/>
    </g>
    <path d="M64 156c-6-72 44-116 118-124 12 74-38 122-118 124z" fill="#6fbb4e"/>
    <path d="M64 156C104 96 146 60 182 32" stroke="#2f7a2c" stroke-width="5" fill="none" stroke-linecap="round"/>
    <g stroke="#3f8f37" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8">
      <path d="M96 120c8-22 26-30 44-30M84 142c4-30 30-44 54-48M124 88c4-18 22-28 38-32"/>
    </g>
    <path d="M196 128c-4-42 26-68 68-74 8 44-22 72-68 74z" fill="#57a83e" opacity=".9"/>`,

  space: `
    <defs>
      <radialGradient id="spaceBg" cx="35%" cy="40%">
        <stop offset="0" stop-color="#243a7d"/><stop offset="1" stop-color="#0a1030"/>
      </radialGradient>
    </defs>
    <rect width="300" height="180" fill="url(#spaceBg)"/>
    <g fill="#ffffff" opacity=".85">
      <circle cx="26" cy="28" r="1.6"/><circle cx="88" cy="18" r="1.2"/><circle cx="150" cy="40" r="1.6"/>
      <circle cx="212" cy="22" r="1.2"/><circle cx="272" cy="52" r="1.6"/><circle cx="46" cy="92" r="1.2"/>
      <circle cx="116" cy="128" r="1.6"/><circle cx="196" cy="148" r="1.2"/><circle cx="262" cy="120" r="1.6"/>
      <circle cx="64" cy="158" r="1.2"/><circle cx="238" cy="86" r="1.2"/>
    </g>
    <ellipse cx="150" cy="98" rx="116" ry="44" fill="none" stroke="#5f79c8" stroke-width="1.4" opacity=".5"/>
    <ellipse cx="150" cy="98" rx="72" ry="27" fill="none" stroke="#5f79c8" stroke-width="1.4" opacity=".4"/>
    <circle cx="150" cy="98" r="20" fill="#ffb545"/>
    <circle cx="150" cy="98" r="28" fill="#ffb545" opacity=".22"/>
    <circle cx="78" cy="110" r="9" fill="#4f9ce8"/>
    <circle cx="222" cy="84" r="7" fill="#e8705f"/>
    <g transform="rotate(-18 254 132)">
      <circle cx="254" cy="132" r="12" fill="#c9a06a"/>
      <ellipse cx="254" cy="132" rx="21" ry="5" fill="none" stroke="#e2c79b" stroke-width="2.5"/>
    </g>`,

  video: `
    <defs>
      <linearGradient id="vidBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#3b2a5e"/><stop offset="1" stop-color="#181233"/>
      </linearGradient>
    </defs>
    <rect width="300" height="180" fill="url(#vidBg)"/>
    <g opacity=".18" stroke="#ffffff" stroke-width="1.2">
      <path d="M0 40h300M0 90h300M0 140h300M75 0v180M150 0v180M225 0v180"/>
    </g>
    <circle cx="150" cy="90" r="38" fill="#ffffff" opacity=".16"/>
    <circle cx="150" cy="90" r="28" fill="#ffffff"/>
    <path d="M143 78l20 12-20 12z" fill="#2b1e4d"/>`,

  checklist: `
    <rect width="300" height="180" fill="#e8f4ec"/>
    <rect x="58" y="12" width="184" height="170" rx="10" fill="#ffffff"/>
    <rect x="118" y="4" width="64" height="20" rx="6" fill="#cbd8e8"/>
    <rect x="82" y="48" width="20" height="20" rx="6" fill="#22a94b"/>
    <path d="M87 58l4 4 7-8" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="112" y="55" width="104" height="6" rx="3" fill="#d9e2ee"/>
    <rect x="82" y="84" width="20" height="20" rx="6" fill="#22a94b"/>
    <path d="M87 94l4 4 7-8" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="112" y="91" width="80" height="6" rx="3" fill="#d9e2ee"/>
    <rect x="82" y="120" width="20" height="20" rx="6" fill="none" stroke="#bcc9d8" stroke-width="2.4"/>
    <rect x="112" y="127" width="92" height="6" rx="3" fill="#e4ebf3"/>`
};

/** Returns the <svg> markup for a thumbnail, or a custom image if one is set. */
window.edgThumb = function (art, image) {
  if (image) {
    return `<img class="art" src="${String(image).replace(/"/g, '&quot;')}" alt="" loading="lazy" />`;
  }
  const body = window.EDG_ART[art] || window.EDG_ART.maths;
  return `<svg class="art" viewBox="0 0 300 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${body}</svg>`;
};
