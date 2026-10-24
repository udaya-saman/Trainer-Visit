/* Approved Trainer Visit improvements: outlets, validation, and accessible feedback.
 * This file intentionally does not clear or rewrite localStorage/sessionStorage.
 */
(function () {
  'use strict';

  const OUTLETS = [
    'Akuressa',
    'Aluthgama',
    'Ambalangoda',
    'Embilipitiya',
    'Galle',
    'Karapitiya',
    'Matara',
    'Matara 02',
    'Megalle',
    'Monaragala',
    'Tangalle',
    'Unawatuna',
    'Welipenna A',
    'Welipenna B'
  ];
  const outletState = new WeakMap();
  let outletObserver;

  const norm = (value) => String(value || '').trim().toLocaleLowerCase();
  const isOtherOption = (option) => !!option && norm(option.textContent) === 'other';
  const isPlaceholder = (option) => !!option && (
    option.value === '' || /^(select|choose|please select)\b/i.test(option.textContent.trim())
  );

  function controlLabel(control) {
    if (!control) return '';
    const labels = [];
    if (control.id) {
      document.querySelectorAll('label[for]').forEach((label) => {
        if (label.htmlFor === control.id) labels.push(label.textContent || '');
      });
    }
    const group = control.closest('.fg');
    if (group) {
      const local = group.querySelector('.flabel, label');
      if (local) labels.push(local.textContent || '');
    }
    if (control.getAttribute('aria-label')) labels.push(control.getAttribute('aria-label'));
    return labels.join(' ').replace(/\s+/g, ' ').trim();
  }

  function findOutletSelect() {
    const selects = Array.from(document.querySelectorAll('select'));
    const labelled = selects.filter((select) => /\boutlet\b/i.test(controlLabel(select)));
    const hasOther = (select) => Array.from(select.options).some(isOtherOption);
    if (labelled.length) return labelled.find(hasOther) || labelled[0];
    return selects.find((select) => hasOther(select) && select.options.length >= 8)
      || selects.find(hasOther);
  }

  function optionIsOneOfNewOutlets(option) {
    return OUTLETS.some((name) => norm(name) === norm(option.textContent)
      && String(option.value) === name);
  }

  function applyOutletList() {
    const select = findOutletSelect();
    if (!select) return false;

    let state = outletState.get(select);
    const existing = Array.from(select.options);
    if (!state) {
      const other = existing.find(isOtherOption);
      const placeholder = existing.find(isPlaceholder);
      const canonical = new Set(OUTLETS.map(norm));
      const legacy = existing.filter((option) =>
        option !== other && option !== placeholder &&
        !(canonical.has(norm(option.textContent)) && String(option.value) === option.textContent.trim())
      ).map((option) => option.cloneNode(true));
      state = {
        other: other ? other.cloneNode(true) : new Option('Other', 'Other'),
        placeholder: placeholder ? placeholder.cloneNode(true) : null,
        legacy,
        applying: false
      };
      outletState.set(select, state);
    }

    const selectedValue = select.value;
    const visibleValues = existing.filter((option) => !option.hidden && !option.dataset.tvLegacy && !isPlaceholder(option))
      .map((option) => norm(option.textContent));
    const expected = [...OUTLETS.map(norm), 'other'];
    const isAlreadyCorrect = visibleValues.length === expected.length
      && visibleValues.every((value, index) => value === expected[index]);

    if (isAlreadyCorrect) {
      refreshLegacyVisibility(select, state);
      if (!select.hasAttribute('aria-label') && !controlLabel(select)) select.setAttribute('aria-label', 'Outlet');
      return true;
    }

    state.applying = true;
    const fragment = document.createDocumentFragment();

    if (state.placeholder) {
      const placeholder = state.placeholder.cloneNode(true);
      placeholder.dataset.tvPlaceholder = 'true';
      fragment.appendChild(placeholder);
    }

    OUTLETS.forEach((name) => {
      const option = new Option(name, name);
      fragment.appendChild(option);
    });

    state.legacy.forEach((original) => {
      const legacy = original.cloneNode(true);
      legacy.disabled = true;
      legacy.hidden = true;
      legacy.dataset.tvLegacy = 'true';
      fragment.appendChild(legacy);
    });

    const other = state.other.cloneNode(true);
    other.hidden = false;
    other.disabled = false;
    fragment.appendChild(other);
    select.replaceChildren(fragment);

    if (selectedValue && Array.from(select.options).some((option) => option.value === selectedValue)) {
      select.value = selectedValue;
    } else {
      const canonicalMatch = OUTLETS.find((name) => norm(name) === norm(selectedValue));
      if (canonicalMatch) select.value = canonicalMatch;
    }
    refreshLegacyVisibility(select, state);
    if (!select.hasAttribute('aria-label') && !controlLabel(select)) select.setAttribute('aria-label', 'Outlet');
    state.applying = false;
    return true;
  }

  function refreshLegacyVisibility(select, state) {
    Array.from(select.options).forEach((option) => {
      if (!option.dataset.tvLegacy) return;
      const selected = option.value === select.value;
      option.hidden = !selected;
      option.disabled = true;
    });
  }

  function fieldForLabel(pattern) {
    const labels = Array.from(document.querySelectorAll('label, .flabel'));
    for (const label of labels) {
      const labelText = (label.textContent || '').replace(/\s+/g, ' ').trim();
      if (!pattern.test(labelText)) continue;
      if (label.htmlFor) {
        const linked = document.getElementById(label.htmlFor);
        if (linked) return linked;
      }
      const group = label.closest('.fg') || label.parentElement;
      const control = group && group.querySelector('input:not([type="button"]):not([type="submit"]), select, textarea');
      if (control) return control;
    }
    const candidates = Array.from(document.querySelectorAll('input, select, textarea'));
    return candidates.find((control) => pattern.test(controlLabel(control))) || null;
  }

  function visible(element) {
    return !!element && !element.disabled && element.type !== 'hidden'
      && (element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0);
  }

  function validationIssues() {
    const issues = [];
    const outlet = findOutletSelect();
    if (outlet && (!String(outlet.value || '').trim() || isPlaceholder(outlet.options[outlet.selectedIndex]))) {
      issues.push({ field: outlet, message: 'Select an outlet before generating the report.' });
    }

    const trainer = fieldForLabel(/\btrainer\b/i);
    if (trainer && visible(trainer) && !String(trainer.value || '').trim()) {
      issues.push({ field: trainer, message: 'Enter the trainer name before generating the report.' });
    }

    const visitDate = fieldForLabel(/\bvisit date\b|\bdate of visit\b|^date$/i);
    if (visitDate && visible(visitDate) && !String(visitDate.value || '').trim()) {
      issues.push({ field: visitDate, message: 'Select the visit date before generating the report.' });
    }

    document.querySelectorAll('input[required], select[required], textarea[required]').forEach((control) => {
      if (visible(control) && typeof control.checkValidity === 'function' && !control.checkValidity()) {
        if (!issues.some((issue) => issue.field === control)) {
          const label = controlLabel(control) || 'A required field';
          issues.push({ field: control, message: label + ' is required or contains an invalid value.' });
        }
      }
    });

    const start = fieldForLabel(/\barrival time\b|\bstart time\b|\bvisit start\b/i);
    const end = fieldForLabel(/\bdeparture time\b|\bend time\b|\bvisit end\b/i);
    if (start && end && String(start.value || '') && String(end.value || '')) {
      const startMinutes = timeToMinutes(start.value);
      const endMinutes = timeToMinutes(end.value);
      if (startMinutes !== null && endMinutes !== null && endMinutes < startMinutes) {
        issues.push({ field: end, message: 'Departure/end time must not be earlier than arrival/start time.' });
      }
    }

    return issues;
  }

  function timeToMinutes(value) {
    const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  function showValidation(issues, target) {
    let status = document.getElementById('trainer-visit-validation');
    if (!status) {
      status = document.createElement('div');
      status.id = 'trainer-visit-validation';
      status.setAttribute('role', 'alert');
      status.setAttribute('aria-live', 'assertive');
      status.style.cssText = 'margin:12px 0;padding:12px 14px;border:1px solid #ce232b;border-radius:8px;background:#fff3f3;color:#8f151b;font-size:14px;line-height:1.45;';
      const host = target && target.closest('.card-body') || document.querySelector('.card-body') || document.body;
      const reference = target && host.contains(target) ? target : host.firstChild;
      host.insertBefore(status, reference);
    }
    status.replaceChildren();
    const heading = document.createElement('strong');
    heading.textContent = 'Please check the following before generating the report:';
    status.appendChild(heading);
    const list = document.createElement('ul');
    list.style.cssText = 'margin:8px 0 0 20px;padding:0;';
    issues.forEach((issue) => {
      const item = document.createElement('li');
      item.textContent = issue.message;
      list.appendChild(item);
    });
    status.appendChild(list);
    const first = issues.find((issue) => issue.field && typeof issue.field.focus === 'function');
    if (first) first.field.focus({ preventScroll: false });
    status.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clearValidation() {
    const status = document.getElementById('trainer-visit-validation');
    if (status) status.remove();
  }

  function handleGenerate(event) {
    const issues = validationIssues();
    if (!issues.length) {
      clearValidation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    showValidation(issues, event.target && event.target.closest ? event.target.closest('.btn-gen') : null);
  }

  function bindValidation() {
    document.addEventListener('click', (event) => {
      const button = event.target && event.target.closest ? event.target.closest('.btn-gen') : null;
      if (button) handleGenerate(event);
    }, true);

    document.addEventListener('submit', (event) => {
      const issues = validationIssues();
      if (!issues.length) {
        clearValidation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      showValidation(issues, event.target && event.target.querySelector ? event.target.querySelector('.btn-gen') : null);
    }, true);

    document.addEventListener('input', clearValidation, true);
    document.addEventListener('change', (event) => {
      if (event.target && event.target.tagName === 'SELECT') {
        const select = event.target;
        const state = outletState.get(select);
        if (state) refreshLegacyVisibility(select, state);
      }
      clearValidation();
    }, true);
  }

  function start() {
    applyOutletList();
    bindValidation();
    if (typeof MutationObserver === 'function' && document.body) {
      outletObserver = new MutationObserver(() => applyOutletList());
      outletObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
