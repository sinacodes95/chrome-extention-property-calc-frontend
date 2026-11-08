const keys = [
  ['AC', 'clear', 'Clear expression'], ['⌫', 'backspace', 'Backspace'],
  ['(', '(', 'Open parenthesis'], [')', ')', 'Close parenthesis'], ['÷', '/', 'Divide'],
  ['7', '7'], ['8', '8'], ['9', '9'], ['^', '^', 'Power'], ['×', '*', 'Multiply'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['!', '!', 'Factorial'], ['−', '-', 'Subtract'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['%', '%', 'Remainder'], ['+', '+', 'Add'],
  ['0', '0'], ['.', '.', 'Decimal point'], [',', ',', 'Argument separator'],
];

const functionGroups = [
  ['Trigonometry', ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2']],
  ['Powers and roots', ['sqrt', 'cbrt', 'exp', 'pow', 'hypot']],
  ['Logarithms', ['ln', 'log', 'log2', 'log10']],
  ['Hyperbolic', ['sinh', 'cosh', 'tanh']],
  ['Rounding and comparison', ['abs', 'floor', 'ceil', 'round', 'trunc', 'min', 'max']],
];

const twoArgumentFunctions = {
  atan2: 'atan2(y, x)',
  pow: 'pow(x, y)',
  hypot: 'hypot(x, y)',
  log: 'log(x) or log(x, base)',
  min: 'min(x, y)',
  max: 'max(x, y)',
};

const formatter = new Intl.NumberFormat('en', { maximumSignificantDigits: 13 });

function formatResult(value) {
  const magnitude = Math.abs(value);
  if (magnitude >= 1e12 || (magnitude > 0 && magnitude < 1e-8)) {
    return Number(value.toPrecision(13)).toExponential();
  }
  return formatter.format(value);
}

function normalize(expression) {
  return expression
    .replaceAll('×', '*')
    .replaceAll('÷', '/')
    .replaceAll('−', '-')
    .replaceAll('π', 'pi')
    .replaceAll('τ', 'tau');
}

export function mountScientific(root, { calculate, loadDraft, saveDraft }) {
  root.innerHTML = `
    <header class="section-heading">
      <h1>Scientific calculator</h1>
      <p>Type an expression or use the keypad.</p>
    </header>
    <div class="tool-pane-grid scientific-grid">
      <form class="panel scientific-form" aria-label="Scientific calculation">
        <div class="scientific-controls">
          <label for="scientific-expression">Expression</label>
          <div class="segmented" role="group" aria-label="Angle unit">
            <button type="button" data-angle="degrees" aria-label="Degrees" aria-pressed="false">Deg</button>
            <button type="button" data-angle="radians" aria-label="Radians" aria-pressed="true">Rad</button>
          </div>
        </div>
        <div class="scientific-display">
          <input id="scientific-expression" type="text" required maxlength="4096" autocomplete="off"
            spellcheck="false" autocapitalize="off" placeholder="sqrt(81) + 2^3" aria-describedby="scientific-keys-help">
          <div class="scientific-output">
            <output for="scientific-expression" aria-live="polite">—</output>
            <button type="button" class="button button-secondary scientific-reuse" hidden>Use result</button>
          </div>
        </div>
        <div class="scientific-keys" role="group" aria-label="Calculator keypad">
          ${keys.map(([label, token, description]) => `
            <button type="button" data-token="${token}" ${description ? `aria-label="${description}"` : ''}>${label}</button>
          `).join('')}
          <button type="submit" class="button button-primary scientific-equals" aria-label="Evaluate expression">=</button>
        </div>
        <p id="scientific-keys-help" class="hint scientific-keys-help"><kbd>Enter</kbd> to evaluate</p>
        <p class="status-error" role="alert" hidden></p>
      </form>
      <aside class="panel scientific-reference" aria-label="Scientific functions and syntax">
        <h2>Functions &amp; constants</h2>
        <div class="scientific-quick" role="group" aria-label="Quick functions and constants">
          <button type="button" data-token="sin(" title="sin(x)">sin</button>
          <button type="button" data-token="cos(" title="cos(x)">cos</button>
          <button type="button" data-token="sqrt(" title="sqrt(x)">sqrt</button>
          <button type="button" data-token="pi" title="Pi">pi</button>
          <button type="button" data-token="tau" title="Tau">tau</button>
          <button type="button" data-token="e" title="Euler’s number">e</button>
        </div>
        <details class="scientific-more">
          <summary>All functions</summary>
          ${functionGroups.map(([category, names]) => `
            <div class="scientific-function-group">
              <h3>${category}</h3>
              <div class="scientific-quick">
                ${names.map(name => `
                  <button type="button" data-token="${name}(" title="${twoArgumentFunctions[name] ?? `${name}(x)`}">${name}</button>
                `).join('')}
              </div>
            </div>
          `).join('')}
          <p class="hint">Use commas between arguments, as in <code>pow(2, 3)</code> or <code>log(64, 2)</code>. <code>log(x)</code> uses base 10.</p>
        </details>
        <details class="scientific-more">
          <summary>Expression syntax</summary>
          <ul class="hint">
            <li>Use <code>*</code> for multiplication, as in <code>2*pi</code>.</li>
            <li><code>%</code> gives the remainder. <code>!</code> accepts whole numbers from 0 to 170.</li>
            <li><code>2^3^2</code> groups as <code>2^(3^2)</code>.</li>
            <li>Scientific notation works, as in <code>1.2e-3</code>.</li>
            <li>The angle unit applies to trig inputs and inverse trig outputs.</li>
          </ul>
        </details>
      </aside>
    </div>
  `;

  const form = root.querySelector('form');
  const expression = root.querySelector('#scientific-expression');
  const result = root.querySelector('output');
  const equals = root.querySelector('.scientific-equals');
  const reuse = root.querySelector('.scientific-reuse');
  const status = root.querySelector('.status-error');
  const modes = [...root.querySelectorAll('[data-angle]')];
  let angleMode = 'radians';
  let lastValue;
  let revision = 0;
  let edited = false;

  function resetResult() {
    revision += 1;
    lastValue = undefined;
    result.textContent = '—';
    equals.disabled = false;
    reuse.hidden = true;
    status.hidden = true;
  }

  function saveEdit() {
    edited = true;
    resetResult();
    saveDraft?.({ expression: expression.value, angleMode });
  }

  function setAngleMode(mode) {
    angleMode = mode;
    modes.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.angle === mode)));
  }

  function edit(token) {
    const { selectionStart: start, selectionEnd: end, value } = expression;
    if (token === 'clear') {
      expression.value = '';
    } else if (token === 'backspace') {
      expression.setRangeText('', start === end ? Math.max(0, start - 1) : start, end, 'end');
    } else if (value.length - (end - start) + token.length <= expression.maxLength) {
      expression.setRangeText(token, start, end, 'end');
    }
    saveEdit();
    expression.focus();
  }

  root.querySelectorAll('[data-token]').forEach(button => {
    button.addEventListener('click', () => edit(button.dataset.token));
  });
  expression.addEventListener('input', saveEdit);
  modes.forEach(button => {
    button.addEventListener('click', () => {
      if (angleMode === button.dataset.angle) return;
      setAngleMode(button.dataset.angle);
      saveEdit();
    });
  });
  reuse.addEventListener('click', () => {
    expression.value = String(lastValue);
    expression.focus();
    expression.setSelectionRange(expression.value.length, expression.value.length);
    saveEdit();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    edited = true;
    if (equals.disabled) return;
    const input = normalize(expression.value.trim());
    if (!input || new TextEncoder().encode(input).length > 4096) {
      status.textContent = !input ? 'Enter an expression.' : 'Use an expression of 4,096 bytes or fewer.';
      status.hidden = false;
      expression.focus();
      return;
    }

    resetResult();
    const current = revision;
    equals.disabled = true;
    result.textContent = 'Calculating…';
    try {
      const response = await calculate({ operation: 'evaluate', expression: input, angle_mode: angleMode });
      if (current !== revision) return;
      if (!Number.isFinite(response.value)) throw new Error('The API did not return a numeric result.');
      lastValue = response.value;
      result.textContent = formatResult(lastValue);
      reuse.hidden = false;
    } catch (error) {
      if (current !== revision) return;
      result.textContent = '—';
      status.textContent = error.message || 'The expression could not be evaluated.';
      status.hidden = false;
    } finally {
      if (current === revision) equals.disabled = false;
    }
  });

  loadDraft?.().then(draft => {
    if (!draft || edited) return;
    if (typeof draft.expression === 'string') expression.value = draft.expression.slice(0, expression.maxLength);
    if (draft.angleMode === 'degrees' || draft.angleMode === 'radians') setAngleMode(draft.angleMode);
  });
}
