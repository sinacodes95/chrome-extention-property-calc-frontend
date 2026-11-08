const modes = {
  underwrite: {
    tab: 'Year one',
    action: 'Run year-one analysis',
    title: 'Year-one results',
    empty: 'Run the analysis to see how the property performs in its first year.',
  },
  project: {
    tab: 'Projection',
    action: 'Run projection',
    title: 'Projection results',
    empty: 'Run a projection to see annual cash flow, investment returns and sale proceeds.',
  },
  sensitivity: {
    tab: 'Sensitivity',
    action: 'Run sensitivity',
    title: 'Sensitivity results',
    empty: 'Run the analysis to compare exit cap rates and rent growth scenarios.',
  },
};

const propertyFields = [
  { name: 'purchase_price', label: 'Purchase price', value: 2000000, min: 0 },
  { name: 'annual_potential_rent', label: 'Potential annual rent', value: 240000, min: 0 },
  { name: 'vacancy_rate', label: 'Vacancy rate', value: 8, unit: '%', min: 0, max: 100 },
  { name: 'annual_operating_expenses', label: 'Annual operating expenses', value: 72000, min: 0 },
  { name: 'acquisition_costs', label: 'Acquisition costs', value: 40000, min: 0, optional: true },
  { name: 'initial_capital_expenditures', label: 'Upfront capital costs', value: 60000, min: 0, optional: true },
  { name: 'annual_other_income', label: 'Annual other income', value: 12000, min: 0, optional: true },
  { name: 'annual_capital_expenditures', label: 'Annual capital costs', value: 12000, min: 0, optional: true },
];

const maxMonths = 4294967295;
const loanFields = [
  { name: 'principal', label: 'Loan amount', value: 1200000, min: 0 },
  { name: 'annual_interest_rate', label: 'Annual interest rate', value: 5.5, unit: '%', min: 0 },
  { name: 'amortization_months', label: 'Amortization', value: 300, unit: 'mo', min: 0, max: maxMonths, step: 1 },
  { name: 'interest_only_months', label: 'Interest-only period', value: 0, unit: 'mo', min: 0, max: maxMonths, step: 1, optional: true },
];

const assumptionFields = [
  { name: 'holding_years', label: 'Holding period', value: 5, unit: 'yr', min: 1, max: 50, step: 1 },
  { name: 'discount_rate', label: 'Discount rate', value: 10, unit: '%', min: -100 },
  { name: 'annual_rent_growth', label: 'Annual rent growth', value: 3, unit: '%', min: -100, optional: true, baseRate: true },
  { name: 'exit_cap_rate', label: 'Exit cap rate', value: 8.5, unit: '%', min: 0, baseRate: true },
  { name: 'selling_cost_rate', label: 'Selling costs', value: 2, unit: '%', min: 0, max: 100, optional: true },
  { name: 'annual_other_income_growth', label: 'Annual other income growth', value: 2, unit: '%', min: -100, optional: true },
  { name: 'annual_expense_growth', label: 'Annual operating expense growth', value: 2.5, unit: '%', min: -100, optional: true },
  { name: 'annual_capex_growth', label: 'Annual capital cost growth', value: 2.5, unit: '%', min: -100, optional: true },
];

const units = { '%': 'percent', mo: 'months', yr: 'years' };
const axisNames = ['rent_growth_rates', 'exit_cap_rates'];
const scenarioMetrics = {
  levered_irr: ['Levered IRR', 'percent'],
  levered_npv: ['Levered NPV', 'amount'],
  unlevered_irr: ['Unlevered IRR', 'percent'],
  unlevered_npv: ['Unlevered NPV', 'amount'],
  gross_sale_price: ['Gross sale price', 'amount'],
};

const underwritingMetrics = [
  ['annual_noi', 'Net operating income'],
  ['cap_rate', 'Cap rate', 'percent'],
  ['annual_cash_flow_after_debt', 'Cash flow after debt'],
];
const projectionMetrics = [
  ['levered_irr', 'Levered IRR', 'percent'],
  ['levered_npv', 'Levered NPV'],
  ['equity_multiple', 'Equity multiple', 'multiple'],
];

const display = {
  amount: new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }),
  percent: new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 2 }),
  multiple: new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }),
};

function valueText(value, type = 'amount') {
  if (!Number.isFinite(value)) return '—';
  return display[type].format(value) + (type === 'multiple' ? '×' : '');
}

function inputField(field) {
  const { name, label, value, unit, min, max, step = 'any', optional, baseRate } = field;
  return `<label class="field"${baseRate ? ' data-base-rate' : ''}>
    <span>${label}${unit ? `<span class="visually-hidden"> in ${units[unit]}</span>` : ''}</span>
    <span class="input-wrap">
      <input type="number" name="${name}" value="${value}" step="${step}"
        inputmode="${step === 1 ? 'numeric' : 'decimal'}"
        ${min === undefined ? '' : `min="${min}"`} ${max === undefined ? '' : `max="${max}"`}
        ${optional ? '' : 'required'}>
      ${unit ? `<span class="field-unit" aria-hidden="true">${unit}</span>` : ''}
    </span>
  </label>`;
}

function inputFields(fields) {
  return fields.map(inputField).join('');
}

function summaryMetrics(fields, result = {}) {
  return `<dl class="result-grid property-metrics">
    ${fields.map(([key, label, type]) => `<div class="metric">
      <dt class="metric-label">${label}</dt>
      <dd class="metric-value">${valueText(result[key], type)}</dd>
    </div>`).join('')}
  </dl>`;
}

function detailRows(title, fields, result) {
  return `<section class="property-result-section">
    <h3>${title}</h3>
    <dl class="property-details-list">
      ${fields.map(([key, label, type]) => `<div>
        <dt>${label}</dt><dd>${valueText(result[key], type)}</dd>
      </div>`).join('')}
    </dl>
  </section>`;
}

function showUnderwriting(root, result) {
  root.innerHTML = summaryMetrics(underwritingMetrics, result) +
    detailRows('Income and cash flow', [
      ['annual_collected_rent', 'Collected rent'],
      ['annual_effective_gross_income', 'Effective gross income'],
      ['annual_cash_flow_before_debt', 'Cash flow before debt'],
      ['break_even_occupancy', 'Break-even occupancy', 'percent'],
      ['cash_on_cash_return', 'Cash-on-cash return', 'percent'],
    ], result) +
    detailRows('Financing', [
      ['annual_debt_service', 'Annual debt service'],
      ['initial_equity', 'Initial equity'],
      ['loan_to_value', 'Loan to value', 'percent'],
      ['debt_yield', 'Debt yield', 'percent'],
      ['debt_service_coverage_ratio', 'Debt service coverage (DSCR)', 'multiple'],
    ], result);
  if (Object.values(result).includes(null)) {
    root.insertAdjacentHTML('beforeend', '<p class="hint property-result-note">A dash marks a ratio that cannot be calculated from these inputs.</p>');
  }
}

const cashFlowColumns = [
  ['levered_cash_flow', 'Levered cash flow'],
  ['unlevered_cash_flow', 'Unlevered cash flow'],
  ['annual_noi', 'Net operating income'],
  ['annual_collected_rent', 'Collected rent'],
  ['annual_other_income', 'Other income'],
  ['annual_effective_gross_income', 'Effective gross income'],
  ['annual_operating_expenses', 'Operating expenses'],
  ['annual_capital_expenditures', 'Capital costs'],
  ['annual_debt_service', 'Debt service'],
  ['ending_loan_balance', 'Ending loan balance'],
];

function annualTable(result) {
  const closing = {
    unlevered_cash_flow: -result.initial_unlevered_investment,
    levered_cash_flow: -result.initial_equity,
  };
  function row(label, values) {
    return `<tr><th scope="row">${label}</th>
      ${cashFlowColumns.map(([key]) => `<td>${valueText(values[key])}</td>`).join('')}
    </tr>`;
  }
  return `<section class="property-result-section">
    <h3 id="property-cash-flow-title">Annual cash flow</h3>
    <p class="hint property-result-note">Year 0 is the purchase. The final year includes sale proceeds and any loan payoff. Scroll across to see all columns.</p>
    <div class="table-scroll property-table" tabindex="0" role="region" aria-labelledby="property-cash-flow-title">
      <table aria-label="Annual property cash flow">
        <thead><tr><th scope="col">Year</th>
          ${cashFlowColumns.map(([, label]) => `<th scope="col">${label}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${row('0', closing)}
          ${result.years.map(year => row(valueText(year.year), year)).join('')}
        </tbody>
      </table>
    </div>
  </section>`;
}

function showProjection(root, result) {
  root.innerHTML = summaryMetrics(projectionMetrics, result) +
    detailRows('Investment and returns', [
      ['initial_unlevered_investment', 'Initial investment'],
      ['initial_equity', 'Initial equity'],
      ['unlevered_irr', 'Unlevered IRR', 'percent'],
      ['unlevered_npv', 'Unlevered NPV'],
    ], result) +
    detailRows('Sale', [
      ['forward_noi', 'Next year’s net operating income'],
      ['gross_sale_price', 'Gross sale price'],
      ['selling_costs', 'Selling costs'],
      ['net_sale_proceeds', 'Net sale proceeds before loan payoff'],
      ['loan_payoff', 'Loan payoff'],
    ], result) +
    annualTable(result);
  if (result.levered_irr === null || result.unlevered_irr === null || result.equity_multiple === null) {
    root.insertAdjacentHTML('beforeend', '<p class="hint property-result-note">A dash marks a return that cannot be calculated from these cash flows.</p>');
  }
}

function showSensitivity(root, result, request, metric, changeMetric) {
  root.innerHTML = `<label class="field property-scenario-metric">
    <span>Show in each scenario</span>
    <select>
      ${Object.entries(scenarioMetrics).map(([key, [label]]) => `<option value="${key}">${label}</option>`).join('')}
    </select>
  </label>
  <p class="hint property-result-note">Darker cells show higher values within this grid. Scroll across to compare more exit cap rates.</p>
  <div class="table-scroll property-table" tabindex="0" role="region" aria-label="Sensitivity grid"></div>
  <p class="hint property-result-note property-scenario-unavailable" hidden>A dash marks a metric that cannot be calculated for that scenario.</p>
  <div class="property-scenario-errors"></div>`;

  const select = root.querySelector('select');
  select.value = metric;

  function updateGrid() {
    const metricKey = select.value;
    const [label, type] = scenarioMetrics[metricKey];
    const growthRates = request.rent_growth_rates;
    const capRates = request.exit_cap_rates;
    const scenarios = result.scenarios;
    const allValues = scenarios.filter(scenario => scenario.ok).map(scenario => scenario.result[metricKey]);
    const values = allValues.filter(Number.isFinite);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const scale = Math.max(Math.abs(low), Math.abs(high), 1);
    const range = high / scale - low / scale;

    function scenarioCell(scenario) {
      if (!scenario?.ok) return '<td class="scenario-error">Error</td>';
      const value = scenario.result[metricKey];
      if (!Number.isFinite(value)) return '<td><span aria-label="Unavailable">—</span></td>';
      const shade = range > 0 ? Math.round(((value / scale - low / scale) / range) * 3) : 0;
      return `<td class="scenario-shade-${shade}">${valueText(value, type)}</td>`;
    }

    root.querySelector('.property-table').innerHTML = `<table class="property-scenarios" aria-label="${label} by rent growth and exit cap rate">
      <colgroup><col></colgroup><colgroup span="${capRates.length}"></colgroup>
      <thead>
        <tr><th scope="col" rowspan="2">Rent growth</th><th scope="colgroup" colspan="${capRates.length}">Exit cap rate</th></tr>
        <tr>${capRates.map(rate => `<th scope="col">${valueText(rate, 'percent')}</th>`).join('')}</tr>
      </thead>
      <tbody>${growthRates.map((rate, row) => `<tr>
        <th scope="row">${valueText(rate, 'percent')}</th>
        ${capRates.map((_, column) => scenarioCell(scenarios[row * capRates.length + column])).join('')}
      </tr>`).join('')}</tbody>
    </table>`;
    root.querySelector('.property-scenario-unavailable').hidden = values.length === allValues.length;
  }

  const failed = result.scenarios.filter(scenario => !scenario.ok);
  if (failed.length > 0) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = failed.length === 1 ? '1 scenario failed' : `${failed.length} scenarios failed`;
    const list = document.createElement('ul');
    for (const scenario of failed) {
      const entry = document.createElement('li');
      const growth = valueText(scenario.annual_rent_growth, 'percent');
      const cap = valueText(scenario.exit_cap_rate, 'percent');
      entry.textContent = `Rent growth ${growth}, exit cap ${cap}. ${scenario.error?.message ?? 'Calculation failed.'}`;
      list.append(entry);
    }
    details.append(summary, list);
    root.querySelector('.property-scenario-errors').append(details);
  }

  select.addEventListener('change', () => {
    changeMetric(select.value);
    updateGrid();
  });
  updateGrid();
}

function axisValues(input) {
  const tokens = input.value.trim().split(/[,\s]+/).filter(Boolean);
  if (tokens.length < 1 || tokens.length > 11) {
    input.setCustomValidity('Enter 1 to 11 percentages separated by commas.');
    return [];
  }
  const rates = tokens.map(token => {
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?%?$/i.test(token)) return NaN;
    return Number(token.replace(/%$/, '')) / 100;
  });
  if (!rates.every(Number.isFinite)) {
    input.setCustomValidity('Use numbers separated by commas, such as 7.5, 8.5, 9.5.');
  }
  return rates;
}

function validateResult(request, result) {
  let valid;
  switch (request.operation) {
    case 'underwrite':
      valid = Number.isFinite(result.annual_noi);
      break;
    case 'project':
      valid = Number.isFinite(result.gross_sale_price) && Array.isArray(result.years) &&
        result.years.length === request.assumptions.holding_years &&
        result.years.every(year => Number.isInteger(year?.year));
      break;
    case 'sensitivity':
      valid = Array.isArray(result.scenarios) &&
        result.scenarios.length === request.rent_growth_rates.length * request.exit_cap_rates.length &&
        result.scenarios.every(scenario => scenario?.ok === false ||
          (scenario?.ok === true && Number.isFinite(scenario.result?.gross_sale_price)));
      break;
  }
  if (!valid) throw new Error('The API did not return the expected property results.');
  return result;
}

export function mountProperty(root, { calculate, loadDraft, saveDraft }) {
  root.classList.add('property-view');
  root.innerHTML = `<div class="property-page-heading">
    <h1>Property analysis</h1>
    <p>Review a commercial property from first-year income to sale.</p>
  </div>
  <div class="property-toolbar">
    <div class="segmented" role="group" aria-label="Property analysis type">
      ${Object.entries(modes).map(([key, { tab }]) => `<button type="button" data-property-mode="${key}" aria-pressed="${key === 'underwrite'}">${tab}</button>`).join('')}
    </div>
    <button type="submit" form="property-form" class="button button-primary property-run">Run year-one analysis</button>
  </div>
  <div class="property-layout">
    <form id="property-form" class="panel property-input-panel" aria-labelledby="property-input-title">
      <div class="section-heading property-section-heading">
        <h2 id="property-input-title">Deal inputs</h2>
        <button type="reset" class="property-example">Reset example</button>
      </div>
      <p class="hint property-input-note">Example values are prefilled. Use one currency for all amounts.</p>
      <div class="field-grid">${inputFields(propertyFields.slice(0, 4))}</div>
      <details class="property-input-group">
        <summary>Additional costs and income</summary>
        <div class="field-grid">${inputFields(propertyFields.slice(4))}</div>
        <p class="hint property-input-note">Enter other income after any vacancy or collection losses.</p>
      </details>
      <details class="property-input-group">
        <summary>Financing <span class="property-financing-summary">Fixed-rate loan</span></summary>
        <label class="field property-funding">
          <span>Funding</span>
          <select name="funding">
            <option value="loan">Fixed-rate loan</option>
            <option value="cash">All cash</option>
          </select>
        </label>
        <fieldset class="property-fieldset" data-loan>
          <legend class="visually-hidden">Loan terms</legend>
          <div class="field-grid">${inputFields(loanFields)}</div>
          <p class="hint property-input-note">Enter 0 for both month fields for a fully interest-only loan.</p>
        </fieldset>
      </details>
      <fieldset class="property-fieldset property-input-group" data-assumptions hidden disabled>
        <legend>Projection assumptions</legend>
        <div class="field-grid">${inputFields(assumptionFields.slice(0, 5))}</div>
        <details class="property-more-growth">
          <summary>Additional growth assumptions</summary>
          <div class="field-grid">${inputFields(assumptionFields.slice(5))}</div>
        </details>
      </fieldset>
      <fieldset class="property-fieldset property-input-group" data-axes hidden disabled>
        <legend>Scenario rates</legend>
        <p class="hint property-input-note" id="property-rates-help">Enter up to 11 percentages in each field, separated by commas.</p>
        <div class="field-grid">
          <label class="field"><span>Annual rent growth (%)</span>
            <input name="rent_growth_rates" type="text" value="0, 3, 5" aria-describedby="property-rates-help" required>
          </label>
          <label class="field"><span>Exit cap rates (%)</span>
            <input name="exit_cap_rates" type="text" value="7.5, 8.5, 9.5" aria-describedby="property-rates-help" required>
          </label>
        </div>
      </fieldset>
    </form>
    <section class="panel property-result-panel" aria-labelledby="property-result-title">
      <div class="section-heading property-section-heading">
        <h2 id="property-result-title">Year-one results</h2>
      </div>
      <p class="status-error property-error" role="alert" hidden></p>
      <p class="property-stale" hidden>Inputs changed. Run the analysis again to refresh these results.</p>
      <div class="property-result-body"></div>
    </section>
  </div>
  <p class="visually-hidden" role="status"></p>`;

  const form = root.querySelector('form');
  const button = root.querySelector('.property-run');
  const resultTitle = root.querySelector('#property-result-title');
  const resultBody = root.querySelector('.property-result-body');
  const resultError = root.querySelector('.property-error');
  const stale = root.querySelector('.property-stale');
  const announcement = root.querySelector('[role="status"]');
  const loan = form.querySelector('[data-loan]');
  const financingSummary = form.querySelector('.property-financing-summary');
  const assumptions = form.querySelector('[data-assumptions]');
  const axes = form.querySelector('[data-axes]');
  const draftFields = [...form.querySelectorAll('input[name], select[name]')];
  const input = name => form.elements.namedItem(name);
  const withLoan = () => input('funding').value === 'loan';
  const states = Object.fromEntries(Object.keys(modes).map(key => [key, {}]));
  let mode = 'underwrite';
  let sensitivityMetric = 'levered_irr';
  let draftTouched = false;

  function syncLoanFields() {
    loan.hidden = !withLoan();
    loan.disabled = !withLoan();
    financingSummary.textContent = withLoan() ? 'Fixed-rate loan' : 'All cash';
  }

  function currentInputs(operation) {
    const names = propertyFields.map(field => field.name);
    if (withLoan()) names.push(...loanFields.map(field => field.name));
    if (operation !== 'underwrite') {
      names.push(...assumptionFields.filter(field => operation === 'project' || !field.baseRate).map(field => field.name));
    }
    if (operation === 'sensitivity') names.push(...axisNames);
    return JSON.stringify([input('funding').value, ...names.map(name => input(name).value)]);
  }

  function clearValidation() {
    for (const control of form.querySelectorAll('input')) control.setCustomValidity('');
  }

  function collect(fields) {
    return Object.fromEntries(fields.map(({ name, unit, optional }) => {
      const control = input(name);
      const value = optional && control.value === '' ? 0 : control.valueAsNumber;
      return [name, unit === '%' ? value / 100 : value];
    }));
  }

  function buildRequest() {
    const property = collect(propertyFields);
    if (property.purchase_price <= 0) input('purchase_price').setCustomValidity('Enter a purchase price greater than zero.');
    if (withLoan()) {
      property.loan = collect(loanFields);
      const loanTerms = property.loan;
      if (loanTerms.principal > property.purchase_price + property.acquisition_costs + property.initial_capital_expenditures) {
        input('principal').setCustomValidity('The loan cannot exceed the purchase price plus acquisition and upfront capital costs.');
      }
      if (loanTerms.amortization_months === 0 && loanTerms.interest_only_months !== 0) {
        input('interest_only_months').setCustomValidity('Enter 0 months here for a fully interest-only loan.');
      }
    }
    const request = { operation: mode, property };
    if (mode !== 'underwrite') {
      request.assumptions = collect(assumptionFields.filter(field => mode === 'project' || !field.baseRate));
      if (request.assumptions.discount_rate <= -1) input('discount_rate').setCustomValidity('Enter a discount rate above −100%.');
    }
    if (mode === 'project' && request.assumptions.exit_cap_rate <= 0) {
      input('exit_cap_rate').setCustomValidity('Enter an exit cap rate greater than zero.');
    }
    if (mode === 'sensitivity') {
      request.rent_growth_rates = axisValues(input('rent_growth_rates'));
      request.exit_cap_rates = axisValues(input('exit_cap_rates'));
      // Sensitivity replaces the base exit cap rate with each scenario's rate.
      request.assumptions.exit_cap_rate = 0.085;
    }
    return request;
  }

  function updateStatus() {
    const state = states[mode];
    button.disabled = !!state.pending;
    button.textContent = state.pending ? 'Calculating…' : modes[mode].action;
    resultBody.setAttribute('aria-busy', String(!!state.pending));
    const snapshot = currentInputs(mode);
    stale.hidden = !state.result || snapshot === state.snapshot;
    resultError.hidden = !state.error || snapshot !== state.errorSnapshot;
    resultError.textContent = resultError.hidden ? '' : state.error;
  }

  function renderResults() {
    resultTitle.textContent = modes[mode].title;
    const state = states[mode];
    if (!state.result) {
      let summary = '';
      if (mode === 'underwrite') summary = summaryMetrics(underwritingMetrics);
      if (mode === 'project') summary = summaryMetrics(projectionMetrics);
      resultBody.innerHTML = summary + `<p class="property-empty">${modes[mode].empty}</p>`;
    } else if (mode === 'underwrite') {
      showUnderwriting(resultBody, state.result);
    } else if (mode === 'project') {
      showProjection(resultBody, state.result);
    } else {
      showSensitivity(resultBody, state.result, state.request, sensitivityMetric, metric => {
        sensitivityMetric = metric;
      });
    }
    updateStatus();
  }

  function selectMode(next) {
    mode = next;
    clearValidation();
    root.querySelectorAll('[data-property-mode]').forEach(tab => {
      tab.setAttribute('aria-pressed', String(tab.dataset.propertyMode === mode));
    });
    assumptions.hidden = mode === 'underwrite';
    assumptions.disabled = assumptions.hidden;
    axes.hidden = mode !== 'sensitivity';
    axes.disabled = axes.hidden;
    assumptions.querySelectorAll('[data-base-rate]').forEach(field => {
      field.hidden = mode === 'sensitivity';
      field.querySelector('input').disabled = field.hidden;
    });
    renderResults();
  }

  function persistDraft() {
    draftTouched = true;
    saveDraft?.({
      mode,
      values: Object.fromEntries(draftFields.map(field => [field.name, field.value])),
    });
  }

  async function restoreDraft() {
    const draft = await loadDraft?.();
    if (!draft || draftTouched) return;
    for (const field of draftFields) {
      const value = draft.values?.[field.name];
      if (typeof value !== 'string') continue;
      if (field.name === 'funding' && value !== 'loan' && value !== 'cash') continue;
      field.value = value;
    }
    syncLoanFields();
    selectMode(Object.hasOwn(modes, draft.mode) ? draft.mode : mode);
  }

  root.querySelectorAll('[data-property-mode]').forEach(tab => {
    tab.addEventListener('click', () => {
      selectMode(tab.dataset.propertyMode);
      persistDraft();
    });
  });
  form.addEventListener('invalid', event => {
    const details = event.target.closest('details');
    if (details) details.open = true;
  }, true);
  form.addEventListener('input', () => {
    clearValidation();
    syncLoanFields();
    updateStatus();
    persistDraft();
  });
  form.addEventListener('reset', () => {
    draftTouched = true;
    clearValidation();
    // The browser restores the default field values after the reset event.
    queueMicrotask(() => {
      syncLoanFields();
      updateStatus();
      persistDraft();
    });
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    draftTouched = true;
    const operation = mode;
    const state = states[operation];
    if (state.pending) return;
    clearValidation();
    const request = buildRequest();
    if (!form.reportValidity()) return;

    const snapshot = currentInputs(operation);
    state.pending = true;
    state.error = '';
    announcement.textContent = '';
    updateStatus();
    try {
      state.result = validateResult(request, await calculate(request));
      state.request = request;
      state.snapshot = snapshot;
      if (mode === operation) announcement.textContent = `${modes[operation].title} updated.`;
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Calculation failed. Try again.';
      state.errorSnapshot = snapshot;
    } finally {
      state.pending = false;
      if (mode === operation) renderResults();
    }
  });

  syncLoanFields();
  selectMode(mode);
  void restoreDraft().catch(() => {
    // The calculator can still use the example when draft storage is unavailable.
  });
}
