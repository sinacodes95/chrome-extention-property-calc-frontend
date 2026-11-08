import { calculate, getEndpoint, isExtension, saveEndpoint } from './api.js';
import { mountProperty } from './property.js';
import { mountFinance } from './finance.js';
import { mountScientific } from './scientific.js';

const icons = {
  property: '<path d="M3 17h14M5 17V6l7-3v14m0-10h3v10M8 8h1m-1 3h1m-1 3h1"/>',
  finance: '<path d="M3 16h14M5 13V9m5 4V5m5 8V7"/>',
  scientific: '<rect x="4" y="2.5" width="12" height="15" rx="2"/><path d="M7 6h6m-6 4h1m4 0h1m-6 4h1m4 0h1"/>',
  settings: '<path d="M3 6h4m4 0h6M3 14h6m4 0h4"/><circle cx="9" cy="6" r="2"/><circle cx="11" cy="14" r="2"/>',
  external: '<path d="M11 4h5v5m0-5-6 6m5 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4"/>',
  arrow: '<path d="M15 10H5m0 0 4-4m-4 4 4 4"/>',
};
function icon(name) {
  return `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
}

const views = [
  ['property', 'Property', mountProperty],
  ['finance', 'Finance', mountFinance],
  ['scientific', 'Scientific', mountScientific],
];
const popup = document.body.classList.contains('is-popup')
  || new URLSearchParams(location.search).get('mode') === 'popup';
if (popup) document.body.classList.add('is-popup');

const app = document.querySelector('#app');
app.innerHTML = `
  <header class="app-header">
    <div class="frame header-inner">
      <div class="brand"><img src="icons/icon-32.png" alt="" width="32" height="32">Property Desk Calc</div>
      <div class="header-tools">
        <span id="connection-state" class="connection-state"></span>
        <a id="expand-link" class="icon-button" href="index.html" target="_blank" rel="noopener"
           title="Open in a tab" aria-label="Open in a tab" ${popup ? '' : 'hidden'}>${icon('external')}</a>
        <a id="settings-link" class="icon-button" href="index.html#settings" title="Connection settings"
           aria-label="Connection settings" ${popup ? 'target="_blank" rel="noopener"' : ''} ${isExtension ? '' : 'hidden'}>${icon('settings')}</a>
      </div>
    </div>
    <div id="navigation" class="frame">
      <div class="app-tabs" role="tablist" aria-label="Calculator workspaces">
        ${views.map(([id, label]) => `<button id="tab-${id}" type="button" role="tab"
          aria-controls="view-${id}" aria-selected="false" tabindex="-1">${icon(id)}<span>${label}</span></button>`).join('')}
      </div>
    </div>
  </header>
  <main id="workspace" class="workspace">
    <div class="frame content-frame">
      <div id="connect-notice" class="connect-notice" hidden>
        <span>Connect a calculation endpoint to run your inputs.</span>
        <a href="index.html#settings" ${popup ? 'target="_blank" rel="noopener"' : ''}>Set up connection</a>
      </div>
      ${views.map(([id]) => `<section id="view-${id}" role="tabpanel" aria-labelledby="tab-${id}" hidden></section>`).join('')}
      <section id="view-settings" class="settings-page" aria-labelledby="settings-title" hidden>
        <a id="settings-back" class="back-link" href="#property">${icon('arrow')} Back to calculators</a>
        <h1 id="settings-title" tabindex="-1">Connection settings</h1>
        <p class="page-description">Calculations run on your API Gateway endpoint.</p>
        <form id="connection-form" class="panel connection-form">
          <div class="field">
            <label for="endpoint">HTTPS endpoint</label>
            <input id="endpoint" name="endpoint" type="url" spellcheck="false" autocapitalize="none" autocomplete="off"
                   placeholder="https://your-api.example.com/calculate" aria-describedby="endpoint-help">
            <p id="endpoint-help" class="hint">Paste the full POST URL, including the stage and route if used. Chrome will ask for access to this host.</p>
          </div>
          <div class="form-actions">
            <button id="save-endpoint" class="button button-primary" type="submit">Save endpoint</button>
            <button id="test-endpoint" class="button button-secondary" type="button" disabled>Test connection</button>
          </div>
          <p id="endpoint-status" class="settings-status" role="status" aria-live="polite"></p>
        </form>
        <p class="hint settings-hint">To disconnect, clear the URL and save.</p>
      </section>
    </div>
  </main>`;

const select = (selector) => app.querySelector(selector);
const tabs = views.map(([id]) => select(`#tab-${id}`));
const workspace = select('#workspace');
const endpointInput = select('#endpoint');
const endpointStatus = select('#endpoint-status');
const saveButton = select('#save-endpoint');
const testButton = select('#test-endpoint');

let current = '';
let lastTool = 'property';
let savedEndpoint = '';
let saving = false;
let testing = false;
let endpointEdited = false;

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

function route() {
  const requested = location.hash.slice(1);
  if (requested === 'settings' && !popup && isExtension) return requested;
  return views.some(([id]) => id === requested) ? requested : 'property';
}

function updateEndpointButtons() {
  saveButton.disabled = saving || testing;
  testButton.disabled = saving || testing || !savedEndpoint || endpointInput.value.trim() !== savedEndpoint;
}

function updateConnection() {
  const status = select('#connection-state');
  status.textContent = !isExtension ? 'Local preview' : savedEndpoint ? 'Endpoint set' : 'Not connected';
  status.dataset.state = !isExtension ? 'preview' : savedEndpoint ? 'ready' : 'empty';
  select('#connect-notice').hidden = !isExtension || Boolean(savedEndpoint) || current === 'settings';
  updateEndpointButtons();
}

async function loadEndpoint() {
  try {
    savedEndpoint = await getEndpoint();
    if (!endpointEdited) endpointInput.value = isExtension ? savedEndpoint : '';
    updateConnection();
  } catch {
    updateConnection();
    if (current === 'settings') showEndpointStatus('Could not read the saved endpoint. Try reloading the extension.', true);
  }
}

function showRoute() {
  const next = route();
  if (next === current) return;
  const previous = current;
  current = next;
  const inSettings = next === 'settings';
  select('#navigation').hidden = inSettings;
  select('#view-settings').hidden = !inSettings;
  select('#settings-link').setAttribute('aria-current', inSettings ? 'page' : 'false');
  if (!inSettings) lastTool = next;
  select('#settings-back').href = `#${lastTool}`;
  select('#expand-link').href = `index.html#${lastTool}`;
  views.forEach(([id], index) => {
    const active = next === id;
    const tab = tabs[index];
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    select(`#view-${id}`).hidden = !active;
  });
  workspace.scrollTop = 0;
  updateConnection();
  if (inSettings && previous) select('#settings-title').focus();
  if (previous === 'settings' && !inSettings) select(`#tab-${next}`).focus();
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

if (!popup) {
  for (const link of [select('#settings-link'), select('#connect-notice a')]) {
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      activate('settings');
    });
  }
}

function showEndpointStatus(message, error = false) {
  endpointStatus.textContent = message;
  endpointStatus.classList.toggle('status-error', error);
}

endpointInput.addEventListener('input', () => {
  endpointEdited = true;
  if (!saving && !testing) showEndpointStatus('');
  updateEndpointButtons();
});

select('#connection-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (saving || testing) return;
  saving = true;
  endpointInput.readOnly = true;
  updateEndpointButtons();
  showEndpointStatus('Saving…');
  try {
    savedEndpoint = await saveEndpoint(endpointInput.value);
    endpointEdited = false;
    endpointInput.value = savedEndpoint;
    showEndpointStatus(savedEndpoint ? 'Endpoint saved.' : 'Endpoint removed.');
  } catch (error) {
    showEndpointStatus(error.message, true);
  } finally {
    saving = false;
    endpointInput.readOnly = false;
    updateConnection();
  }
});

testButton.addEventListener('click', async () => {
  testing = true;
  endpointInput.readOnly = true;
  updateEndpointButtons();
  showEndpointStatus('Testing connection…');
  try {
    const result = await calculate({ operation: 'evaluate', expression: '1+1' });
    if (result.value !== 2) throw new Error('The endpoint did not return the expected calculation result.');
    showEndpointStatus('Connection works.');
  } catch (error) {
    showEndpointStatus(error.message, true);
  } finally {
    testing = false;
    endpointInput.readOnly = false;
    updateEndpointButtons();
  }
});

if (isExtension) {
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local' && !saving) void loadEndpoint();
  });
  window.addEventListener('focus', () => { if (!saving) void loadEndpoint(); });
}

window.addEventListener('hashchange', showRoute);
showRoute();
void loadEndpoint();
