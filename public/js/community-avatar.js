(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MolDrawAvatar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const BG = ['#E7F3F3', '#E7ECF1', '#F4EFE6', '#EEF1F4'];
  const SKIN = ['#F6E4D4', '#E7CDB6', '#D7B494', '#C4A07A'];
  const HAIR = ['#243038', '#4E5D66', '#2C7A7B', '#8A7356'];
  const SHIRT = ['#2C7A7B', '#3E5160', '#C9BBA8', '#1F2A32'];
  const EYE = '#243038';
  const MOUTH = '#A56B58';
  const PRESETS = [
    { seed: 'f00301010', label: 'Crop' },
    { seed: 'f12010221', label: 'Sweep' },
    { seed: 'f21102002', label: 'Long' },
    { seed: 'f33201113', label: 'Bob' },
    { seed: 'f40310230', label: 'Bun' },
    { seed: 'f51201101', label: 'Side' },
    { seed: 'f10120012', label: 'Soft' },
    { seed: 'f23001123', label: 'Neat' }
  ];

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function initials(name) {
    return String(name || 'M').trim().slice(0, 1).toUpperCase() || 'M';
  }

  function clampIndex(value, max) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(max, Math.floor(n));
  }

  function decode(style, seed) {
    if (style !== 'face') return null;
    const match = String(seed || '').match(/^f([0-5])([0-3])([0-3])([0-2])([0-2])([0-2])([0-3])([0-3])$/);
    if (!match) return null;
    return {
      hair: Number(match[1]),
      hairColor: HAIR[Number(match[2])],
      skin: SKIN[Number(match[3])],
      eyes: Number(match[4]),
      mouth: Number(match[5]),
      shirt: Number(match[6]),
      shirtColor: SHIRT[Number(match[7])],
      bg: BG[Number(match[8])]
    };
  }

  function randomSeed() {
    const pick = (max) => Math.floor(Math.random() * max);
    return `f${pick(6)}${pick(4)}${pick(4)}${pick(3)}${pick(3)}${pick(3)}${pick(4)}${pick(4)}`;
  }

  function hairMarkup(style, color) {
    const cuts = [
      `<path fill="${color}" d="M16 30c1-12 7-18 16-18s15 6 16 18c-3-7-8-10-16-10s-13 3-16 10z"/>`,
      `<path fill="${color}" d="M14 32c2-14 8-20 18-20 7 0 13 4 15 12-7-1-12 2-18 6-5 2-10 3-15 2z"/>`,
      `<path fill="${color}" d="M13 34c1-16 8-22 19-22s18 6 18 20v14c-3-5-6-6-9-5 0 5-2 8-6 8s-5-3-6-8c-4-1-7 0-10 5z"/>`,
      `<path fill="${color}" d="M14 36c0-16 7-22 18-22s18 6 18 22c0 7-2 12-7 14-2-7-4-9-11-9s-9 2-11 9c-5-2-7-7-7-14z"/>`,
      `<circle cx="32" cy="11" r="6" fill="${color}"/><path fill="${color}" d="M16 31c1-12 7-17 16-17s15 5 16 17c-3-6-8-9-16-9s-13 3-16 9z"/>`,
      `<path fill="${color}" d="M15 31c2-13 8-19 17-19 8 0 14 5 15 13-1 1-3 16-5 24-1 2-3 1-3-1 1-7 2-14 0-17-6 2-12 3-17 2-3-1-6-1-7-2z"/>`
    ];
    return cuts[clampIndex(style, cuts.length - 1)];
  }

  function eyesMarkup(style) {
    if (style === 2) {
      return `<path d="M22 33c2.2 2.2 5.2 2.2 7.2 0M35 33c2.2 2.2 5.2 2.2 7.2 0" fill="none" stroke="${EYE}" stroke-width="1.7" stroke-linecap="round"/>`;
    }
    if (style === 1) {
      return `<ellipse cx="26" cy="33" rx="2.1" ry="2.7" fill="${EYE}"/><ellipse cx="38" cy="33" rx="2.1" ry="2.7" fill="${EYE}"/>`;
    }
    return `<circle cx="26" cy="33" r="2.2" fill="${EYE}"/><circle cx="38" cy="33" r="2.2" fill="${EYE}"/><circle cx="26.7" cy="32.3" r="0.7" fill="#fff"/><circle cx="38.7" cy="32.3" r="0.7" fill="#fff"/>`;
  }

  function mouthMarkup(style) {
    if (style === 1) return `<path d="M28 41h8" stroke="${MOUTH}" stroke-width="1.5" stroke-linecap="round"/>`;
    if (style === 2) return `<path d="M27 40c2.2 3.4 7.8 3.4 10 0" fill="none" stroke="${MOUTH}" stroke-width="1.6" stroke-linecap="round"/>`;
    return `<path d="M28 40.5c1.8 2.4 6.2 2.4 8 0" fill="none" stroke="${MOUTH}" stroke-width="1.5" stroke-linecap="round"/>`;
  }

  function shirtMarkup(style, color) {
    const body = `<path fill="${color}" d="M8 64c3-14 10-20 24-20s21 6 24 20z"/>`;
    if (style === 1) return `${body}<path fill="#fff" fill-opacity="0.28" d="M27 46l5 7 5-7z"/>`;
    if (style === 2) return `${body}<path d="M26 47l6 9 6-9" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="1.4" stroke-linejoin="round"/>`;
    return body;
  }

  function svg(config) {
    return `<svg class="avatar-face-svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><circle cx="32" cy="32" r="32" fill="${config.bg}"/>${shirtMarkup(config.shirt, config.shirtColor)}<rect x="27" y="42" width="10" height="8" rx="3" fill="${config.skin}"/><ellipse cx="17.5" cy="33" rx="2.4" ry="3.2" fill="${config.skin}"/><ellipse cx="46.5" cy="33" rx="2.4" ry="3.2" fill="${config.skin}"/><ellipse cx="32" cy="31" rx="14" ry="16" fill="${config.skin}"/>${hairMarkup(config.hair, config.hairColor)}${eyesMarkup(config.eyes)}${mouthMarkup(config.mouth)}</svg>`;
  }

  function html(name, source) {
    const config = decode(source?.avatar_style, source?.avatar_seed);
    if (!config) return `<span class="avatar avatar-teal">${escapeHtml(initials(name))}</span>`;
    return `<span class="avatar avatar-face has-image">${svg(config)}</span>`;
  }

  return {
    presets: () => PRESETS.map((item) => ({ ...item })),
    decode,
    randomSeed,
    svg,
    html
  };
});
