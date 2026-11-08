import { calculate } from './api.js';
import { mountProperty } from './property.js';
import { mountFinance } from './finance.js';
import { mountScientific } from './scientific.js';

const icons = {
  property: '<path d="M3 17h14M5 17V6l7-3v14m0-10h3v10M8 8h1m-1 3h1m-1 3h1"/>',
  finance: '<path d="M3 16h14M5 13V9m5 4V5m5 8V7"/>',
  scientific: '<rect x="4" y="2.5" width="12" height="15" rx="2"/><path d="M7 6h6m-6 4h1m4 0h1m-6 4h1m4 0h1"/>',
  external: '<path d="M11 4h5v5m0-5-6 6m5 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4"/>',
};
function icon(name) {
  return `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
}

const views = [
  ['property', 'Property', mountProperty],
  ['finance', 'Finance', mountFinance],
  ['scientific', 'Scientific', mountScientific],
];
const isExtension = Boolean(globalThis.chrome?.runtime?.id);
const popup = document.body.classList.contains('is-popup')
  || new URLSearchParams(location.search).get('mode') === 'popup';
if (popup) {
  document.body.classList.add('is-popup');
  if (!isExtension) document.body.classList.add('is-popup-preview');
}

const app = document.querySelector('#app');
app.innerHTML = `
  <header class="app-header">
    <div class="frame header-inner">
      <div class="brand"><img src="icons/icon-32.png" alt="" width="32" height="32">Property Desk Calc</div>
      <div class="header-tools">
        <span class="local-label">Runs locally</span>
        <a id="expand-link" class="icon-button" href="index.html" target="_blank" rel="noopener"
           title="Open in a tab" aria-label="Open in a tab" ${popup ? '' : 'hidden'}>${icon('external')}</a>
      </div>
    </div>
    <div class="frame">
      <div class="app-tabs" role="tablist" aria-label="Calculator workspaces">
        ${views.map(([id, label]) => `<button id="tab-${id}" type="button" role="tab"
          aria-controls="view-${id}" aria-selected="false" tabindex="-1">${icon(id)}<span>${label}</span></button>`).join('')}
      </div>
    </div>
  </header>
  <main id="workspace" class="workspace">
    <div class="frame content-frame">
      ${views.map(([id]) => `<section id="view-${id}" role="tabpanel" aria-labelledby="tab-${id}" hidden></section>`).join('')}
    </div>
  </main>`;

const select = (selector) => app.querySelector(selector);
const tabs = views.map(([id]) => select(`#tab-${id}`));
const workspace = select('#workspace');
let current = '';

function draftStorage(id) {
  const key = `propertyDeskDraft:${id}`;
  return {
    async loadDraft() {
      try {
        if (isExtension) return (await chrome.storage.session.get(key))[key];
        return JSON.parse(sessionStorage.getItem(key)) ?? undefined;
      } catch {
        return undefined;
      }
    },
    saveDraft(value) {
      try {
        if (isExtension) void chrome.storage.session.set({ [key]: value }).catch(() => {});
        else sessionStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Drafts are optional; blocked storage must not stop calculations.
      }
    },
  };
}

for (const [id, , mount] of views) {
  mount(select(`#view-${id}`), { calculate, ...draftStorage(id) });
}

function showRoute() {
  const requested = location.hash.slice(1);
  const next = views.some(([id]) => id === requested) ? requested : 'property';
  if (next === current) return;
  current = next;
  select('#expand-link').href = `index.html#${next}`;
  views.forEach(([id], index) => {
    const active = next === id;
    const tab = tabs[index];
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    select(`#view-${id}`).hidden = !active;
  });
  workspace.scrollTop = 0;
}

function activate(id) {
  if (location.hash !== `#${id}`) location.hash = id;
  showRoute();
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activate(views[index][0]));
  tab.addEventListener('keydown', (event) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    activate(views[next][0]);
    tabs[next].focus();
  });
});

window.addEventListener('hashchange', showRoute);
showRoute();
