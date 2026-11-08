const cashFlowNumber = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const amountFormatter = new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rateFormatter = new Intl.NumberFormat('en', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const maxMonths = 4_294_967_295;

const tools = {
  npv: {
    heading: 'Net present value',
    action: 'Calculate NPV',
    help: 'Discount equally spaced cash flows to see what they are worth today.',
    empty: 'Calculate NPV to see the value of these cash flows at your discount rate.',
  },
  irr: {
    heading: 'Internal rate of return',
    action: 'Calculate IRR',
    help: 'Find the return per period. Cash flows must change sign once, ignoring zeros.',
    empty: 'Calculate IRR to see the rate that makes the net present value zero.',
  },
  loan: {
    heading: 'Fixed-rate loan',
    action: 'Calculate loan',
    help: 'See payments and the balance after a given number of months.',
    empty: 'Calculate the loan to see the next payment, upcoming debt service and amounts paid.',
  },
};

function parseCashFlows(value) {
  const entries = value.trim().split(/,[ \t]*(?:\r?\n[ \t]*)*|(?:\r?\n[ \t]*)+/);
  return entries.map((entry, index) => {
    const amount = entry.trim().replaceAll('−', '-');
    if (!cashFlowNumber.test(amount) || !Number.isFinite(Number(amount))) {
      throw new Error(`Enter a valid amount for period ${index}. Separate amounts with a comma or line break.`);
    }
    return Number(amount);
  });
}

function formatAmount(value) {
  if (!Number.isFinite(value)) throw new Error('The calculator engine returned an invalid amount.');
  return Math.abs(value) >= 1e15 ? value.toExponential(4) : amountFormatter.format(value);
}

function formatRate(value) {
  if (!Number.isFinite(value)) throw new Error('The calculator engine returned an invalid rate.');
  if (Math.abs(value) >= 1e13) {
    const [mantissa, exponent] = value.toExponential(4).split('e');
    return `${mantissa}e+${Number(exponent) + 2}%`;
  }
  return rateFormatter.format(value);
}

function metricsFor(operation, result) {
  if (operation === 'npv') return [['Net present value', formatAmount(result.value)]];
  if (operation === 'irr') return [['Return per period', formatRate(result.value)]];
  return [
    ['Next monthly payment', formatAmount(result.monthly_payment)],
    ['Debt service, next 12 months', formatAmount(result.annual_debt_service)],
    ['Remaining balance', formatAmount(result.remaining_balance)],
    ['Principal paid to date', formatAmount(result.principal_paid)],
    ['Interest paid to date', formatAmount(result.interest_paid)],
  ];
}

function numberField(name, label, value, options = {}) {
  const { unit, min, max, step = 'any', hint } = options;
  return `
    <div class="field">
      <label for="finance-${name}">${label}</label>
      <span ${unit ? 'class="input-wrap"' : ''}>
        <input id="finance-${name}" name="${name}" type="number" ${step === 1 ? 'inputmode="numeric"' : 'inputmode="decimal"'}
          value="${value}" step="${step}" required
          ${min === undefined ? '' : `min="${min}"`} ${max === undefined ? '' : `max="${max}"`}
          ${hint ? `aria-describedby="finance-${name}-hint"` : ''}>
        ${unit ? `<span class="field-unit" aria-hidden="true">${unit}</span>` : ''}
      </span>
      ${hint ? `<span class="hint" id="finance-${name}-hint">${hint}</span>` : ''}
    </div>
  `;
}

export function mountFinance(root, { calculate, loadDraft, saveDraft }) {
  const monthOptions = { min: 0, max: maxMonths, step: 1 };
  root.innerHTML = `
    <header class="section-heading">
      <h1>Finance calculators</h1>
      <p>Value a stream of cash flows or check a loan’s payments and balance.</p>
    </header>
    <div class="segmented finance-nav" role="group" aria-label="Finance calculator">
      <button type="button" data-tool="npv" aria-pressed="true">NPV</button>
      <button type="button" data-tool="irr" aria-pressed="false">IRR</button>
      <button type="button" data-tool="loan" aria-pressed="false">Loan</button>
    </div>
    <div class="tool-pane-grid finance-grid">
      <section class="panel finance-inputs" aria-labelledby="finance-inputs-title">
        <h2 id="finance-inputs-title"></h2>
        <p class="hint finance-help"></p>
        <form id="finance-cash-form">
          <div class="field">
            <label for="finance-cash-flows">Cash flows by period</label>
            <textarea id="finance-cash-flows" name="cash_flows" rows="5" required spellcheck="false" aria-describedby="finance-cash-help">-100000\n25000\n30000\n35000\n40000</textarea>
            <span id="finance-cash-help" class="hint">The first amount is at time zero. Use negatives for outflows. Separate amounts with a comma or line break and omit thousands separators.</span>
          </div>
          ${numberField('rate', 'Discount rate per period (%)', 8, { unit: '%' })}
          <div class="form-actions"><button type="submit" class="button button-primary"></button></div>
        </form>
        <form id="finance-loan-form" hidden>
          <div class="field-grid">
            ${numberField('principal', 'Principal', 300000, { min: 0 })}
            ${numberField('annual_interest_rate', 'Annual interest rate (%)', 6, { min: 0, unit: '%' })}
            ${numberField('amortization_months', 'Amortization (months)', 240, { ...monthOptions, hint: 'Use 0 for a fully interest-only loan.' })}
            ${numberField('interest_only_months', 'Interest only (months)', 0, { ...monthOptions, hint: 'Months before amortization starts.' })}
            ${numberField('elapsed_months', 'Payments made (months)', 0, monthOptions)}
          </div>
          <div class="form-actions"><button type="submit" class="button button-primary">Calculate loan</button></div>
        </form>
      </section>
      <section class="panel finance-results" aria-labelledby="finance-results-title">
        <h2 id="finance-results-title">Results</h2>
        <p class="hint finance-state" role="status"></p>
        <p class="status-error" role="alert" hidden></p>
        <dl class="result-grid finance-metrics" aria-live="polite" hidden></dl>
        <p class="hint finance-currency" hidden>Amounts are shown in the currency you entered.</p>
      </section>
    </div>
  `;

  const tabs = [...root.querySelectorAll('[data-tool]')];
  const title = root.querySelector('#finance-inputs-title');
  const help = root.querySelector('.finance-help');
  const cashForm = root.querySelector('#finance-cash-form');
  const loanForm = root.querySelector('#finance-loan-form');
  const fields = [...cashForm.elements, ...loanForm.elements].filter(field => field.name);
  const cashButton = cashForm.querySelector('button[type="submit"]');
  const loanButton = loanForm.querySelector('button[type="submit"]');
  const discount = cashForm.elements.rate;
  const amortization = loanForm.elements.amortization_months;
  const interestOnly = loanForm.elements.interest_only_months;
  const state = root.querySelector('.finance-state');
  const status = root.querySelector('.status-error');
  const metrics = root.querySelector('.finance-metrics');
  const currencyNote = root.querySelector('.finance-currency');
  const outcomes = {};
  let selected = 'npv';
  let edited = false;

  function saveEdit() {
    edited = true;
    saveDraft?.({ selected, values: Object.fromEntries(fields.map(field => [field.name, field.value])) });
  }

  function render() {
    const tool = tools[selected];
    const outcome = outcomes[selected];
    const isLoan = selected === 'loan';
    title.textContent = tool.heading;
    help.textContent = tool.help;
    cashForm.hidden = isLoan;
    loanForm.hidden = !isLoan;
    discount.closest('.field').hidden = selected !== 'npv';
    discount.disabled = selected !== 'npv';
    interestOnly.disabled = amortization.valueAsNumber === 0;
    tabs.forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.tool === selected)));
    if (isLoan) {
      loanButton.disabled = Boolean(outcome?.pending);
      loanButton.textContent = outcome?.pending ? 'Calculating…' : tool.action;
    } else {
      cashButton.disabled = Boolean(outcome?.pending);
      cashButton.textContent = outcome?.pending ? 'Calculating…' : tool.action;
    }

    status.hidden = !outcome?.error;
    status.textContent = outcome?.error || '';
    state.hidden = Boolean(outcome?.error || outcome?.metrics);
    state.textContent = outcome?.pending ? 'Calculating…' : tool.empty;
    metrics.hidden = !outcome?.metrics;
    currencyNote.hidden = !outcome?.metrics || selected === 'irr';
    metrics.replaceChildren();
    if (outcome?.metrics) {
      outcome.metrics.forEach(([label, value], index) => {
        const metric = document.createElement('div');
        metric.className = index === 0 ? 'metric finance-primary-metric' : 'metric';
        const term = document.createElement('dt');
        term.className = 'metric-label';
        term.textContent = label;
        const amount = document.createElement('dd');
        amount.className = 'metric-value';
        amount.textContent = value;
        metric.append(term, amount);
        metrics.append(metric);
      });
    }
  }

  function readRequest(operation) {
    if (operation === 'loan') {
      return {
        operation,
        terms: {
          principal: loanForm.elements.principal.valueAsNumber,
          annual_interest_rate: loanForm.elements.annual_interest_rate.valueAsNumber / 100,
          amortization_months: amortization.valueAsNumber,
          interest_only_months: interestOnly.disabled ? 0 : interestOnly.valueAsNumber,
        },
        elapsed_months: loanForm.elements.elapsed_months.valueAsNumber,
      };
    }
    const cash_flows = parseCashFlows(cashForm.elements.cash_flows.value);
    if (operation === 'irr') return { operation, cash_flows };
    const rate = discount.valueAsNumber / 100;
    if (rate <= -1) throw new Error('Enter a discount rate greater than −100%.');
    return { operation, cash_flows, rate };
  }

  async function submit(event) {
    event.preventDefault();
    edited = true;
    const operation = selected;
    if (outcomes[operation]?.pending) return;
    const outcome = { pending: true };
    outcomes[operation] = outcome;
    try {
      const request = readRequest(operation);
      render();
      outcome.metrics = metricsFor(operation, await calculate(request));
    } catch (error) {
      outcome.error = error.message || 'The calculation failed. Try again.';
    } finally {
      outcome.pending = false;
      if (outcomes[selected] === outcome) render();
    }
  }

  tabs.forEach(tab => tab.addEventListener('click', () => {
    if (selected === tab.dataset.tool) return;
    selected = tab.dataset.tool;
    saveEdit();
    render();
  }));
  cashForm.addEventListener('input', event => {
    delete outcomes.npv;
    if (event.target !== discount) delete outcomes.irr;
    saveEdit();
    render();
  });
  loanForm.addEventListener('input', () => {
    delete outcomes.loan;
    saveEdit();
    render();
  });
  cashForm.addEventListener('submit', submit);
  loanForm.addEventListener('submit', submit);
  render();

  loadDraft?.().then(draft => {
    if (!draft || edited) return;
    if (Object.hasOwn(tools, draft.selected)) selected = draft.selected;
    for (const field of fields) {
      const value = draft.values?.[field.name];
      if (typeof value === 'string') field.value = value;
    }
    render();
  });
}
