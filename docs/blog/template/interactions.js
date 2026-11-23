(function () {
  'use strict';

  const STEP_INTERVAL_MILLISECONDS = 1100;
  const SCROLL_OFFSET_PIXELS = 110;
  const MILLISECONDS_PER_DAY = 86400000;
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

  function createElement(tagName, properties, children) {
    const element = document.createElement(tagName);
    const { className, text, html, dataset, attributes, onClick } = properties ?? {};
    if (className !== undefined) { element.className = className; }
    if (text !== undefined) { element.textContent = text; }
    if (html !== undefined) { element.innerHTML = html; }
    Object.entries(dataset ?? {}).forEach(([key, value]) => { element.dataset[key] = value; });
    Object.entries(attributes ?? {}).forEach(([key, value]) => { element.setAttribute(key, value); });
    if (onClick !== undefined) { element.addEventListener('click', onClick); }
    (children ?? []).forEach((child) => { element.append(child); });
    return element;
  }

  function createSvgElement(tagName, attributes, text) {
    const element = document.createElementNS(SVG_NAMESPACE, tagName);
    Object.entries(attributes ?? {}).forEach(([key, value]) => { element.setAttribute(key, value); });
    if (text !== undefined) { element.textContent = text; }
    return element;
  }

  function itemsOf(widgetElement) {
    return JSON.parse(widgetElement.querySelector('.widget-items').textContent);
  }

  function escapeText(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function activateOnKeyboard(element, activate) {
    element.addEventListener('keydown', (keyboardEvent) => {
      if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
        keyboardEvent.preventDefault();
        activate();
      }
    });
  }

  /* Selector: a row of options with one detail panel. */

  function initialiseSelector(widgetElement) {
    const widgetItems = itemsOf(widgetElement);
    const widgetBody = widgetElement.querySelector('.widget-body');
    const optionRow = createElement('div', { className: 'selector-options', dataset: { layout: widgetElement.dataset.layout } });
    const detailPanel = createElement('div', { className: 'selector-detail', attributes: { 'aria-live': 'polite' } });
    const optionButtons = widgetItems.map((widgetItem, itemIndex) => {
      const optionButton = createElement('button', {
        className: 'selector-option',
        attributes: { type: 'button', 'aria-pressed': 'false' },
        dataset: { line: widgetItem.line },
        onClick: () => select(itemIndex),
      }, [
        createElement('span', { className: 'selector-tag', text: widgetItem.metadata.tag ?? '' }),
        createElement('span', { className: 'selector-title', html: widgetItem.titleHtml }),
      ]);
      optionRow.append(optionButton);
      return optionButton;
    });
    function select(selectedIndex) {
      optionButtons.forEach((optionButton, buttonIndex) => {
        optionButton.setAttribute('aria-pressed', String(buttonIndex === selectedIndex));
      });
      const selectedItem = widgetItems[selectedIndex];
      detailPanel.dataset.line = selectedItem.line;
      detailPanel.innerHTML = `<h4 class="selector-detail-title">${selectedItem.titleHtml}</h4>${selectedItem.html}`;
    }
    widgetBody.append(optionRow, detailPanel);
    select(0);
  }

  /* Diagram details: every [data-part] in the SVG opens the item with the same id. */

  function initialiseDiagramDetails(widgetElement) {
    const widgetItems = itemsOf(widgetElement);
    const itemsByIdentifier = new Map(widgetItems.map((widgetItem) => [widgetItem.metadata.id, widgetItem]));
    const detailPanel = widgetElement.querySelector('[data-role="detail-panel"]');
    const partElements = [...widgetElement.querySelectorAll('[data-part]')];
    function select(partIdentifier) {
      const selectedItem = itemsByIdentifier.get(partIdentifier);
      if (selectedItem === undefined) { return; }
      partElements.forEach((partElement) => {
        partElement.classList.toggle('is-selected', partElement.dataset.part === partIdentifier);
      });
      detailPanel.dataset.line = selectedItem.line;
      detailPanel.innerHTML = `<p class="detail-panel-kicker">Selected</p><h4 class="detail-panel-title">${selectedItem.titleHtml}</h4>${selectedItem.html}`;
    }
    partElements.forEach((partElement) => {
      const partItem = itemsByIdentifier.get(partElement.dataset.part);
      partElement.setAttribute('tabindex', '0');
      partElement.setAttribute('role', 'button');
      partElement.setAttribute('aria-label', partItem === undefined ? partElement.dataset.part : partItem.title);
      const activate = () => select(partElement.dataset.part);
      partElement.addEventListener('click', (clickEvent) => { clickEvent.stopPropagation(); activate(); });
      activateOnKeyboard(partElement, activate);
    });
    select(widgetElement.dataset.widget === 'concept-architecture' ? 'workflow-loop' : widgetItems[0].metadata.id);
  }

  /* Machine capacity. */

  function initialiseMachineCapacity(widgetElement) {
    const agentsNeededInput = widgetElement.querySelector('[data-role="agents-needed"]');
    const agentsNeededValue = widgetElement.querySelector('[data-role="agents-needed-value"]');
    const perMachineButtons = [...widgetElement.querySelectorAll('[data-role="agents-per-machine"] .segmented-option')];
    const resultLine = widgetElement.querySelector('[data-role="capacity-result"]');
    const machineRow = widgetElement.querySelector('[data-role="capacity-machines"]');
    let agentsPerMachine = 3;
    function render() {
      const agentsNeeded = Number(agentsNeededInput.value);
      const machineCount = Math.ceil(agentsNeeded / agentsPerMachine);
      agentsNeededValue.textContent = String(agentsNeeded);
      perMachineButtons.forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.value) === agentsPerMachine)));
      resultLine.innerHTML = `${agentsNeeded} ${agentsNeeded === 1 ? 'agent' : 'agents'} at ${agentsPerMachine} per machine: <strong>${machineCount} ${machineCount === 1 ? 'machine' : 'machines'}</strong>.`;
      machineRow.replaceChildren();
      let agentsLeft = agentsNeeded;
      for (let i = 0; i < machineCount; i += 1) {
        const machine = createElement('div', { className: 'capacity-machine', attributes: { title: `Machine ${i + 1}` } });
        machine.append(createElement('span', { className: 'capacity-core is-loop' }));
        for (let slotIndex = 0; slotIndex < agentsPerMachine; slotIndex += 1) {
          machine.append(createElement('span', { className: agentsLeft > 0 ? 'capacity-core is-agent' : 'capacity-core' }));
          agentsLeft -= 1;
        }
        machineRow.append(machine);
      }
    }
    agentsNeededInput.addEventListener('input', render);
    perMachineButtons.forEach((button) => button.addEventListener('click', () => {
      agentsPerMachine = Number(button.dataset.value);
      render();
    }));
    render();
  }

  /* Gate bench. */

  function initialiseGateBench(widgetElement) {
    const RESUMES_BEFORE_PARKING = 2;
    const ladderSteps = ['First run of the gates', 'Resume 1 of 2: same agent session, with the failure', 'Resume 2 of 2: same agent session, with the failure', 'Parked: a person gets a decision to make'];
    const ladder = widgetElement.querySelector('[data-role="gate-ladder"]');
    const outcomePanel = widgetElement.querySelector('[data-role="gate-outcome"]');
    const passButton = widgetElement.querySelector('[data-action="gate-pass"]');
    const failButton = widgetElement.querySelector('[data-action="gate-fail"]');
    const cannotRunButton = widgetElement.querySelector('[data-action="gate-cannot-run"]');
    let failureCount = 0;
    let outcome = { tone: '', title: 'Nothing has run yet', text: 'The Workflow Loop runs the gates. The agent does not.' };
    let isSettled = false;
    function render() {
      ladder.replaceChildren(...ladderSteps.map((stepText, stepIndex) => {
        const stateClass = stepIndex === failureCount ? 'is-current' : stepIndex < failureCount ? 'is-reached' : '';
        return createElement('li', { className: stateClass }, [createElement('span', { className: 'gate-ladder-mark' }), stepText]);
      }));
      outcomePanel.className = `gate-outcome ${outcome.tone}`;
      outcomePanel.innerHTML = `<p class="gate-outcome-title">${outcome.title}</p><p>${outcome.text}</p>`;
      passButton.disabled = isSettled;
      failButton.disabled = isSettled;
      cannotRunButton.disabled = isSettled;
    }
    passButton.addEventListener('click', () => {
      outcome = { tone: 'tone-green', title: 'Green', text: 'Only now does the Workflow Loop let the task move to the next phase.' };
      isSettled = true;
      render();
    });
    failButton.addEventListener('click', () => {
      failureCount += 1;
      if (failureCount > RESUMES_BEFORE_PARKING) {
        outcome = { tone: 'tone-crimson', title: 'Parked', text: 'After a set number of retries, two in this example, the task is parked and a person gets a decision to make.' };
        isSettled = true;
      } else {
        outcome = { tone: 'tone-orange', title: `Red: resume ${failureCount} of ${RESUMES_BEFORE_PARKING}`, text: 'The Workflow Loop resumes the same agent session with the failure.' };
      }
      render();
    });
    cannotRunButton.addEventListener('click', () => {
      outcome = { tone: 'tone-crimson', title: 'An incident', text: 'A gate that cannot run at all is treated as an incident, not as a failure of the agent\'s work.' };
      render();
    });
    widgetElement.querySelector('[data-action="gate-reset"]').addEventListener('click', () => {
      failureCount = 0;
      isSettled = false;
      outcome = { tone: '', title: 'Nothing has run yet', text: 'The Workflow Loop runs the gates. The agent does not.' };
      render();
    });
    render();
  }

  /* Boundary explorer. */

  function initialiseBoundaryExplorer(widgetElement) {
    const layers = itemsOf(widgetElement).map((layerItem) => ({ ...layerItem, isConnected: true }));
    const switchColumn = widgetElement.querySelector('[data-role="boundary-switches"]');
    const verdictLine = widgetElement.querySelector('[data-role="boundary-verdict"]');
    function render() {
      switchColumn.replaceChildren(...layers.map((layer) => createElement('button', {
        className: 'boundary-switch',
        attributes: { type: 'button', 'aria-pressed': String(layer.isConnected) },
        dataset: { line: layer.line },
        onClick: () => { layer.isConnected = !layer.isConnected; render(); },
      }, [
        createElement('span', { className: 'switch-track' }),
        createElement('span', { className: 'boundary-switch-name', text: `${layer.title}: ${layer.isConnected ? 'connected' : 'not there'}` }),
        createElement('span', { className: 'boundary-switch-text', text: layer.isConnected ? layer.metadata.on : layer.metadata.off }),
      ])));
      layers.forEach((layer) => {
        widgetElement.querySelectorAll(`[data-layer="${layer.metadata.id}"], [data-layer-edge="${layer.metadata.id}"]`).forEach((layerElement) => {
          layerElement.classList.toggle('is-off', !layer.isConnected);
        });
      });
      const connectedCount = layers.filter((layer) => layer.isConnected).length;
      verdictLine.textContent = `${connectedCount} of ${layers.length} connected. The factory in the middle did not change.`;
    }
    render();
  }

  /* Status table. */

  function initialiseStatusTable(widgetElement) {
    const STATUS_LABELS = { built: 'Built', partly: 'Partly', 'not-yet': 'Not yet' };
    const STATUS_PILL_CLASSES = { built: 'pill pill-green', partly: 'pill', 'not-yet': 'pill pill-neutral' };
    const widgetItems = itemsOf(widgetElement);
    const widgetBody = widgetElement.querySelector('.widget-body');
    const filterRow = createElement('div', { className: 'status-filter' });
    const filterButtons = createElement('div', { className: 'segmented' });
    const countLine = createElement('span', { className: 'status-count' });
    const headRow = createElement('div', { className: 'status-head', html: '<span>Status</span><span>The vision</span><span>In foundry</span><span>What that means</span>' });
    const rowList = createElement('div', { className: 'status-rows' });
    let activeFilter = 'all';
    function render() {
      filterButtons.replaceChildren(...['all', 'built', 'partly', 'not-yet'].map((filterKey) => {
        const matchCount = filterKey === 'all' ? widgetItems.length : widgetItems.filter((widgetItem) => widgetItem.metadata.status === filterKey).length;
        return createElement('button', {
          className: 'segmented-option',
          text: `${filterKey === 'all' ? 'All' : STATUS_LABELS[filterKey]} ${matchCount}`,
          attributes: { type: 'button', 'aria-pressed': String(filterKey === activeFilter) },
          onClick: () => { activeFilter = filterKey; render(); },
        });
      }));
      const shownItems = widgetItems.filter((widgetItem) => activeFilter === 'all' || widgetItem.metadata.status === activeFilter);
      countLine.textContent = `${shownItems.length} of ${widgetItems.length} parts shown`;
      rowList.replaceChildren(...shownItems.map((widgetItem) => createElement('div', { className: 'status-row', dataset: { line: widgetItem.line } }, [
        createElement('div', {}, [createElement('span', { className: STATUS_PILL_CLASSES[widgetItem.metadata.status], text: STATUS_LABELS[widgetItem.metadata.status] })]),
        createElement('div', { className: 'status-row-vision', html: widgetItem.titleHtml }),
        createElement('div', { className: 'status-row-foundry', html: inlineCode(widgetItem.metadata.foundry ?? '') }),
        createElement('div', { className: 'status-row-text', html: widgetItem.html }),
      ])));
    }
    filterRow.append(filterButtons, countLine);
    widgetBody.append(filterRow, headRow, rowList);
    render();
  }

  function inlineCode(text) {
    return escapeText(text).replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  /* Roadmap. */

  function initialiseRoadmap(widgetElement) {
    const stages = itemsOf(widgetElement);
    const widgetBody = widgetElement.querySelector('.widget-body');
    const track = createElement('div', { className: 'roadmap-track' });
    const detailPanel = createElement('div', { className: 'detail-panel roadmap-detail', attributes: { 'aria-live': 'polite' } });
    const stageButtons = stages.map((stage, stageIndex) => {
      const hasDecision = stage.metadata.decision !== undefined;
      const stageButton = createElement('button', {
        className: `roadmap-stage${stageIndex === 0 ? ' is-built' : ''}${hasDecision ? ' has-decision' : ''}`,
        attributes: { type: 'button', 'aria-pressed': 'false' },
        dataset: { line: stage.line },
        onClick: () => select(stageIndex),
      }, [
        createElement('span', { className: 'roadmap-marker' }, [createElement('span', { text: stage.metadata.stage })]),
        createElement('span', { className: 'roadmap-stage-name', html: stage.titleHtml }),
        createElement('span', { className: 'roadmap-stage-note', text: stageIndex === 0 ? 'foundry today' : hasDecision ? 'holds a decision' : '' }),
      ]);
      track.append(stageButton);
      return stageButton;
    });
    function select(selectedIndex) {
      const stage = stages[selectedIndex];
      stageButtons.forEach((stageButton, buttonIndex) => stageButton.setAttribute('aria-pressed', String(buttonIndex === selectedIndex)));
      const decisionHtml = stage.metadata.decision === undefined ? '' : `<p class="roadmap-decision"><strong>The decision.</strong> ${inlineCode(stage.metadata.decision)}</p>`;
      detailPanel.dataset.line = stage.line;
      detailPanel.innerHTML = [
        `<p class="detail-panel-kicker">Stage ${escapeText(stage.metadata.stage)} of ${stages.length}</p>`,
        `<h4 class="detail-panel-title">${stage.titleHtml}</h4>`,
        `<p class="roadmap-facts"><span class="pill pill-neutral">Concept: ${escapeText(stage.metadata.chapters ?? '')}</span><span class="pill">Foundry today: ${inlineCode(stage.metadata.starts ?? '')}</span></p>`,
        stage.html,
        decisionHtml,
      ].join('');
    }
    widgetBody.append(track, detailPanel);
    select(0);
  }

  /* History: lanes over time, with milestones. */

  function initialiseHistory(widgetElement) {
    const CHART_WIDTH = 1000;
    const LANE_LABEL_WIDTH = 160;
    const CHART_RIGHT = 880;
    const AXIS_TOP = 34;
    const LANE_HEIGHT = 54;
    const LANE_COLOURS = ['var(--ticket)', 'var(--teal)', 'var(--orange)', 'var(--green)'];
    const AXIS_DATES = ['2026-09-19', '2026-10-01', '2026-10-15', '2026-11-01', '2026-11-15'];
    const historyItems = itemsOf(widgetElement);
    const lanes = historyItems.filter((historyItem) => historyItem.metadata.kind === 'lane');
    const milestones = historyItems
      .filter((historyItem) => historyItem.metadata.kind === 'event')
      .sort((a, b) => a.metadata.date.localeCompare(b.metadata.date));
    const dayOf = (isoDate) => Date.parse(`${isoDate}T00:00:00Z`) / MILLISECONDS_PER_DAY;
    const firstDay = dayOf('2026-09-14');
    const lastDay = dayOf('2026-11-22');
    const horizontalOf = (isoDate) => LANE_LABEL_WIDTH + ((dayOf(isoDate) - firstDay) / (lastDay - firstDay)) * (CHART_RIGHT - LANE_LABEL_WIDTH);
    const verticalOf = (laneIndex) => AXIS_TOP + 34 + laneIndex * LANE_HEIGHT;
    const formatDate = (isoDate) => {
      const [year, month, day] = isoDate.split('-').map(Number);
      return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
    };
    const chartHeight = verticalOf(lanes.length - 1) + 40;
    const chart = createSvgElement('svg', { class: 'history-chart', viewBox: `0 0 ${CHART_WIDTH} ${chartHeight}`, role: 'img', 'aria-label': 'A timeline of four lines of work: agent-progress, agent-dashboard, forge and Gaia, with their milestones.' });

    AXIS_DATES.forEach((isoDate) => {
      const horizontal = horizontalOf(isoDate);
      chart.append(createSvgElement('path', { class: 'axis-line', d: `M${horizontal} ${AXIS_TOP}V${chartHeight - 10}` }));
      chart.append(createSvgElement('text', { class: 'axis-label', x: horizontal, y: AXIS_TOP - 10 }, formatDate(isoDate).replace(' 2026', '').replace(/^(\d+) (\w{3})\w*/, '$1 $2')));
    });

    const laneIndexByName = new Map(lanes.map((lane, laneIndex) => [lane.title, laneIndex]));
    lanes.forEach((lane, laneIndex) => {
      const vertical = verticalOf(laneIndex);
      const startHorizontal = horizontalOf(lane.metadata.start);
      const endHorizontal = horizontalOf(lane.metadata.end);
      chart.append(createSvgElement('text', { class: 'lane-name', x: 8, y: vertical + 5 }, lane.title));
      chart.append(createSvgElement('rect', { class: 'lane-bar', x: startHorizontal - 9, y: vertical - 9, width: endHorizontal - startHorizontal + 18, height: 18, rx: 9, fill: LANE_COLOURS[laneIndex % LANE_COLOURS.length] }));
    });

    const sharedHistoryEnd = lanes[0];
    const continuation = lanes[laneIndexByName.get('forge')];
    if (sharedHistoryEnd !== undefined && continuation !== undefined && sharedHistoryEnd.metadata['shared-until'] !== undefined) {
      const fromHorizontal = horizontalOf(sharedHistoryEnd.metadata['shared-until']);
      const toHorizontal = horizontalOf(continuation.metadata.start);
      chart.append(createSvgElement('path', { class: 'lane-join', d: `M${fromHorizontal} ${verticalOf(0) + 9}L${toHorizontal} ${verticalOf(laneIndexByName.get('forge')) - 9}` }));
    }
    const bracketHorizontal = CHART_RIGHT + 14;
    const bracketTop = verticalOf(laneIndexByName.get('forge')) - 12;
    const bracketBottom = verticalOf(laneIndexByName.get('Gaia')) + 12;
    chart.append(createSvgElement('path', { class: 'bracket', d: `M${bracketHorizontal - 6} ${bracketTop}H${bracketHorizontal}V${bracketBottom}H${bracketHorizontal - 6}` }));
    chart.append(createSvgElement('text', { class: 'bracket-label', x: bracketHorizontal + 10, y: (bracketTop + bracketBottom) / 2 + 5 }, 'foundry'));

    const detailPanel = createElement('div', { className: 'detail-panel history-detail', attributes: { 'aria-live': 'polite' } });
    const lastHorizontalByLane = new Map();
    const milestoneDots = milestones.map((milestone, milestoneIndex) => {
      const laneIndex = laneIndexByName.get(milestone.metadata.lane);
      const horizontal = horizontalOf(milestone.metadata.date);
      const previous = lastHorizontalByLane.get(laneIndex);
      const isCrowded = previous !== undefined && horizontal - previous.horizontal < 17;
      const verticalShift = isCrowded ? (previous.verticalShift <= 0 ? 8 : -8) : 0;
      lastHorizontalByLane.set(laneIndex, { horizontal, verticalShift });
      const dot = createSvgElement('circle', {
        class: 'event-dot',
        cx: horizontal,
        cy: verticalOf(laneIndex) + verticalShift,
        r: 7.5,
        fill: LANE_COLOURS[laneIndex % LANE_COLOURS.length],
        tabindex: '0',
        role: 'button',
        'aria-label': `${formatDate(milestone.metadata.date)}: ${milestone.title}`,
      });
      dot.addEventListener('click', () => select(milestoneIndex));
      activateOnKeyboard(dot, () => select(milestoneIndex));
      chart.append(dot);
      return dot;
    });

    function select(selectedIndex) {
      const milestone = milestones[selectedIndex];
      const lane = lanes[laneIndexByName.get(milestone.metadata.lane)];
      milestoneDots.forEach((dot, dotIndex) => dot.classList.toggle('is-selected', dotIndex === selectedIndex));
      detailPanel.dataset.line = milestone.line;
      detailPanel.innerHTML = [
        `<p class="history-detail-meta"><strong>${formatDate(milestone.metadata.date)}</strong><span class="pill pill-neutral">${escapeText(milestone.metadata.lane)}</span><span>commit <code>${escapeText(milestone.metadata.commit ?? '')}</code></span><a href="${lane.metadata.link}" target="_blank" rel="noopener">repository</a></p>`,
        `<h4 class="detail-panel-title">${milestone.titleHtml}</h4>`,
        milestone.html,
      ].join('');
      const stepRow = createElement('div', { className: 'history-steps' }, [
        createElement('button', { className: 'button button-small', text: 'Earlier', attributes: { type: 'button' }, onClick: () => select(selectedIndex - 1) }),
        createElement('button', { className: 'button button-small', text: 'Later', attributes: { type: 'button' }, onClick: () => select(selectedIndex + 1) }),
      ]);
      stepRow.firstChild.disabled = selectedIndex === 0;
      stepRow.lastChild.disabled = selectedIndex === milestones.length - 1;
      detailPanel.append(stepRow);
    }

    widgetElement.querySelector('.widget-body').append(chart, detailPanel);
    select(0);
  }

  /* Pipeline flows: three mock pipelines, and one ticket walked through the chosen one. */

  function initialisePipelineFlows(widgetElement) {
    const ACTOR_LABELS = { person: 'you', agent: 'agents', loop: 'the loop', done: 'done' };
    const widgetItems = itemsOf(widgetElement);
    const examples = widgetItems.filter((widgetItem) => widgetItem.metadata.kind === 'example');
    const everyStep = widgetItems.filter((widgetItem) => widgetItem.metadata.kind !== 'example');
    const widgetBody = widgetElement.querySelector('.widget-body');
    const exampleButtons = createElement('div', { className: 'segmented' });
    const legend = createElement('div', { className: 'flow-legend', html: '<span class="legend-person">you</span><span class="legend-agent">agents</span><span class="legend-loop">the loop</span><span class="legend-gate">gates, run by the loop</span>' });
    const exampleSummary = createElement('p', { className: 'flow-summary' });
    const flow = createElement('div', { className: 'flow' });
    const narration = createElement('div', { className: 'flow-narration', attributes: { 'aria-live': 'polite' } });

    let activeExample = examples[0];
    let steps = [];
    let beats = [];
    let beatIndex = 0;
    let timer = null;

    function stepsOf(example) {
      return everyStep.filter((step) => step.metadata.in.split(',').map((key) => key.trim()).includes(example.metadata.key));
    }

    /* A beat is one thing the reader sees: a wait for a person, a sentence, a gate run, or the end. */
    function beatsOf(example, exampleSteps) {
      const exampleBeats = [];
      exampleSteps.forEach((step, stepIndex) => {
        if (step.metadata.actor === 'done') {
          exampleBeats.push({ kind: 'done', stepIndex, html: escapeText(example.metadata.done) });
          return;
        }
        if (step.metadata.actor === 'person') {
          exampleBeats.push({ kind: 'wait', stepIndex, html: `<strong>Waiting for you.</strong> ${escapeText(step.metadata.waiting)}` });
        }
        exampleBeats.push({ kind: 'say', stepIndex, html: step.html });
        if (step.metadata.gate !== undefined) {
          exampleBeats.push({ kind: 'gate', stepIndex, html: escapeText(step.metadata.gate) });
        }
      });
      return exampleBeats;
    }

    function stopTimer() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }

    function showExample(example) {
      stopTimer();
      activeExample = example;
      steps = stepsOf(example);
      beats = beatsOf(example, steps);
      beatIndex = 0;
      render();
    }

    function showNextBeat() {
      stopTimer();
      beatIndex += 1;
      render();
      const beat = beats[beatIndex];
      if (beat.kind === 'say' || beat.kind === 'gate') {
        timer = window.setTimeout(showNextBeat, STEP_INTERVAL_MILLISECONDS * 1.5);
      }
    }

    function render() {
      const beat = beats[beatIndex];
      const isFinished = beat.kind === 'done';
      const personMoments = steps.filter((step) => step.metadata.actor === 'person').length;

      exampleButtons.replaceChildren(...examples.map((example) => createElement('button', {
        className: 'segmented-option',
        html: example.titleHtml,
        attributes: { type: 'button', 'aria-pressed': String(example === activeExample) },
        dataset: { line: example.line },
        onClick: () => showExample(example),
      })));
      exampleSummary.dataset.line = activeExample.line;
      exampleSummary.innerHTML = `${activeExample.html.replace(/^<p[^>]*>|<\/p>$/g, '')} <strong>A person is needed ${personMoments === 1 ? 'once' : `${personMoments} times`}.</strong>`;

      const flowChildren = [];
      steps.forEach((step, stepIndex) => {
        if (stepIndex > 0) {
          const previousStep = steps[stepIndex - 1];
          const gateBeatIndex = beats.findIndex((candidate) => candidate.kind === 'gate' && candidate.stepIndex === stepIndex - 1);
          const linkState = gateBeatIndex === -1 ? '' : beatIndex > gateBeatIndex ? ' is-passed' : beatIndex === gateBeatIndex ? ' is-checking' : '';
          const link = createElement('div', { className: `flow-link${linkState}`, attributes: { 'aria-hidden': 'true' } });
          if (previousStep.metadata.gate !== undefined) {
            link.append(createElement('span', { className: 'flow-gate', text: 'gates' }));
          }
          flowChildren.push(link);
        }
        const isCurrent = beat.stepIndex === stepIndex;
        const isDone = stepIndex < beat.stepIndex || (isFinished && isCurrent);
        const isWaiting = isCurrent && beat.kind === 'wait';
        const stateClasses = [isCurrent && !isFinished ? 'is-active' : '', isDone ? 'is-done' : '', isWaiting ? 'is-waiting' : ''].filter((stateClass) => stateClass !== '').join(' ');
        const node = createElement('div', { className: `flow-node actor-${step.metadata.actor} ${stateClasses}`, dataset: { line: step.line } }, [
          createElement('span', { className: 'flow-ticket', attributes: { title: 'The ticket is here' } }),
          createElement('span', { className: 'flow-actor', text: ACTOR_LABELS[step.metadata.actor] }),
          createElement('span', { className: 'flow-name', html: step.titleHtml }),
          createElement('span', { className: 'flow-card-text', text: step.metadata.card ?? '' }),
        ]);
        const stateRow = createElement('span', { className: 'flow-state' });
        if (isWaiting) {
          stateRow.append(createElement('button', { className: 'button button-primary', text: step.metadata.button, attributes: { type: 'button' }, onClick: showNextBeat }));
        } else if (isDone) {
          stateRow.append(createElement('span', { className: 'flow-check', text: '✓', attributes: { 'aria-label': 'done' } }));
        } else if (isCurrent) {
          stateRow.append(createElement('span', { className: 'flow-working', text: beat.kind === 'gate' ? 'gates running' : 'working', attributes: {} }));
        }
        node.append(stateRow);
        flowChildren.push(node);
      });
      flow.replaceChildren(...flowChildren);

      const currentStep = steps[beat.stepIndex];
      const narrationParts = [
        createElement('span', { className: isFinished ? 'pill pill-green' : beat.kind === 'wait' ? 'pill' : 'pill pill-neutral', text: isFinished ? 'Done' : `Step ${beat.stepIndex + 1} of ${steps.length - 1}: ${currentStep.title}` }),
        createElement('div', { className: 'flow-narration-text', html: beat.html, dataset: { line: currentStep.line } }),
      ];
      if (beatIndex > 0) {
        narrationParts.push(createElement('button', { className: 'button button-small', text: 'Start over', attributes: { type: 'button' }, onClick: () => showExample(activeExample) }));
      }
      narration.replaceChildren(...narrationParts);
      const activeNode = flow.querySelector('.flow-node.is-active');
      if (activeNode !== null && beatIndex > 0 && window.matchMedia('(max-width: 1000px)').matches) {
        activeNode.scrollIntoView({ block: 'nearest' });
      }
    }

    widgetBody.append(createElement('div', { className: 'flow-head' }, [exampleButtons, legend]), exampleSummary, flow, narration);
    showExample(examples[0]);
  }

  /* Navigation, reading progress and theme. */

  function initialiseNavigation() {
    const partLinks = document.querySelector('[data-role="part-links"]');
    const chapterList = document.querySelector('[data-role="chapter-list"]');
    const chapterMenu = document.querySelector('[data-role="chapter-menu"]');
    const currentChapterLabel = document.querySelector('[data-role="current-chapter"]');
    const progressBar = document.querySelector('[data-role="reading-progress"]');
    const headings = [...document.querySelectorAll('main .part-heading, main .chapter-heading')];
    const chapterLinks = new Map();
    const partLinkElements = new Map();
    headings.forEach((heading) => {
      if (heading.classList.contains('part-heading')) {
        const partTitle = heading.querySelector('.part-title').textContent;
        const partLabel = heading.querySelector('.part-label').textContent;
        chapterList.append(createElement('p', { className: 'chapter-menu-part', text: `${partLabel}: ${partTitle}` }));
        const partLink = createElement('a', { className: 'part-link', text: partTitle, attributes: { href: `#${heading.id}` } });
        partLinks.append(partLink);
        partLinkElements.set(heading.id, partLink);
        return;
      }
      const chapterNumber = heading.querySelector('.chapter-number');
      const chapterLink = createElement('a', { className: 'chapter-menu-link', attributes: { href: `#${heading.id}` } }, [
        createElement('span', { className: 'chapter-menu-number', text: chapterNumber === null ? '' : chapterNumber.textContent }),
        createElement('span', { text: heading.dataset.tableOfContents }),
      ]);
      chapterLink.addEventListener('click', () => { chapterMenu.open = false; });
      chapterList.append(chapterLink);
      chapterLinks.set(heading.id, chapterLink);
    });
    document.addEventListener('click', (clickEvent) => {
      if (chapterMenu.open && !chapterMenu.contains(clickEvent.target)) { chapterMenu.open = false; }
    });

    let updateIsQueued = false;
    function update() {
      updateIsQueued = false;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      progressBar.style.width = `${scrollable <= 0 ? 0 : Math.min(100, (window.scrollY / scrollable) * 100)}%`;
      let currentChapter = null;
      let currentPart = null;
      headings.forEach((heading) => {
        if (heading.getBoundingClientRect().top <= SCROLL_OFFSET_PIXELS) {
          if (heading.classList.contains('part-heading')) { currentPart = heading; currentChapter = null; } else { currentChapter = heading; }
        }
      });
      chapterLinks.forEach((chapterLink, headingIdentifier) => chapterLink.setAttribute('aria-current', String(currentChapter !== null && currentChapter.id === headingIdentifier)));
      partLinkElements.forEach((partLink, headingIdentifier) => partLink.setAttribute('aria-current', String(currentPart !== null && currentPart.id === headingIdentifier)));
      currentChapterLabel.textContent = currentChapter === null ? 'Chapters' : currentChapter.textContent.replace(/^(\d+)/, '$1. ');
    }
    window.addEventListener('scroll', () => {
      if (!updateIsQueued) {
        updateIsQueued = true;
        window.requestAnimationFrame(update);
      }
    }, { passive: true });
    update();

    document.querySelector('[data-action="toggle-theme"]').addEventListener('click', () => {
      document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    });

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const heroTicket = document.querySelector('.hero-ticket');
      heroTicket.querySelector('animateMotion').remove();
      heroTicket.setAttribute('transform', 'translate(420 80)');
    }
  }

  /* Screenshots open full size in a dialog, with the arrow keys stepping through them. */

  function initialiseScreenshotLightbox() {
    const screenshotImages = [...document.querySelectorAll('.screenshot-image')];
    if (screenshotImages.length === 0 || typeof HTMLDialogElement === 'undefined') { return; }
    const enlargedImage = createElement('img', { className: 'lightbox-image', attributes: { alt: '' } });
    const caption = createElement('p', { className: 'lightbox-caption' });
    const counter = createElement('span', { className: 'lightbox-counter' });
    const previousButton = createElement('button', { className: 'button button-small', text: 'Previous', attributes: { type: 'button' } });
    const nextButton = createElement('button', { className: 'button button-small', text: 'Next', attributes: { type: 'button' } });
    const closeButton = createElement('button', { className: 'button button-small', text: 'Close', attributes: { type: 'button' } });
    const dialog = createElement('dialog', { className: 'lightbox', attributes: { 'aria-label': 'Screenshot at full size' } }, [
      createElement('div', { className: 'lightbox-bar' }, [caption, counter, previousButton, nextButton, closeButton]),
      enlargedImage,
    ]);
    document.body.append(dialog);
    let shownIndex = 0;
    function show(screenshotIndex) {
      shownIndex = (screenshotIndex + screenshotImages.length) % screenshotImages.length;
      const sourceImage = screenshotImages[shownIndex];
      enlargedImage.src = sourceImage.src;
      enlargedImage.alt = sourceImage.alt;
      caption.innerHTML = sourceImage.closest('figure').querySelector('figcaption').innerHTML;
      counter.textContent = `${shownIndex + 1} of ${screenshotImages.length}`;
    }
    screenshotImages.forEach((screenshotImage, screenshotIndex) => {
      const open = () => {
        show(screenshotIndex);
        dialog.showModal();
      };
      screenshotImage.setAttribute('tabindex', '0');
      screenshotImage.setAttribute('role', 'button');
      screenshotImage.setAttribute('aria-label', `Enlarge the screenshot: ${screenshotImage.alt}`);
      screenshotImage.addEventListener('click', open);
      activateOnKeyboard(screenshotImage, open);
    });
    previousButton.addEventListener('click', () => show(shownIndex - 1));
    nextButton.addEventListener('click', () => show(shownIndex + 1));
    closeButton.addEventListener('click', () => dialog.close());
    enlargedImage.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (clickEvent) => {
      if (clickEvent.target === dialog) { dialog.close(); }
    });
    dialog.addEventListener('keydown', (keyboardEvent) => {
      if (keyboardEvent.key === 'ArrowLeft') { show(shownIndex - 1); }
      if (keyboardEvent.key === 'ArrowRight') { show(shownIndex + 1); }
    });
  }

  const WIDGET_INITIALISERS = {
    selector: initialiseSelector,
    'concept-architecture': initialiseDiagramDetails,
    'compounding-loop': initialiseDiagramDetails,
    'foundry-architecture': initialiseDiagramDetails,
    'machine-capacity': initialiseMachineCapacity,
    'gate-bench': initialiseGateBench,
    'boundary-explorer': initialiseBoundaryExplorer,
    'status-table': initialiseStatusTable,
    roadmap: initialiseRoadmap,
    history: initialiseHistory,
    'pipeline-flows': initialisePipelineFlows,
  };

  document.querySelectorAll('figure.widget').forEach((widgetElement) => {
    const initialise = WIDGET_INITIALISERS[widgetElement.dataset.widgetKind];
    if (initialise === undefined) { return; }
    try {
      initialise(widgetElement);
    } catch (error) {
      console.error(`The widget ${widgetElement.dataset.widget} failed to start`, error);
    }
  });
  initialiseNavigation();
  initialiseScreenshotLightbox();
}());
