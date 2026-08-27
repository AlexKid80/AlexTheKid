(function () {
  "use strict";

  const initialState = () => ({
    operator: "",
    family: null,
    en8120: null,
    contactors: null,
    doors: null,
    copb: null,
    side: null,
    stops: null,
    fireman: null,
    vip: null
  });

  let state = initialState();
  let history = ["landing"];
  let currentStep = "landing";

  const content = document.getElementById("wizard-content");
  const progressRegion = document.getElementById("progress-region");
  const progressLabel = document.getElementById("progress-label");
  const progressPercent = document.getElementById("progress-percent");
  const progressBar = document.getElementById("progress-bar");

  document.getElementById("year").textContent = new Date().getFullYear();

  function getFlow() {
    const flow = ["operator", "family", "en8120"];

    if (state.family === "traction") {
      flow.push("contactors");
    }

    flow.push("doors");

    if (state.doors === 2) {
      flow.push("copb", "side");
    }

    flow.push("stops", "fireman", "vip", "review");
    return flow;
  }

  function nextStepFrom(stepId) {
    const flow = getFlow();
    const index = flow.indexOf(stepId);
    return index >= 0 && index < flow.length - 1 ? flow[index + 1] : "review";
  }

  function goTo(stepId, addToHistory = true) {
    currentStep = stepId;

    if (addToHistory) {
      history.push(stepId);
    }

    render();
  }

  function goNext() {
    goTo(nextStepFrom(currentStep));
  }

  function goBack() {
    if (history.length <= 1) {
      return;
    }

    history.pop();
    currentStep = history[history.length - 1];
    render();
  }

  function cancelConfiguration() {
    state = initialState();
    history = ["landing"];
    currentStep = "landing";
    render();
  }

  function updateProgress() {
    const isWizardStep = currentStep !== "landing" && currentStep !== "success";
    progressRegion.hidden = !isWizardStep;

    if (!isWizardStep) {
      return;
    }

    const flow = getFlow();
    const index = Math.max(flow.indexOf(currentStep), 0);
    const percent = Math.round(((index + 1) / flow.length) * 100);

    progressLabel.textContent = `Step ${index + 1} of ${flow.length}`;
    progressPercent.textContent = `${percent}%`;
    progressBar.style.width = `${percent}%`;
  }

  function navigationMarkup() {
    return `
      <div class="step-navigation">
        <button class="text-button" type="button" data-action="back">&larr; Back</button>
        <button class="text-button cancel" type="button" data-action="cancel">Cancel</button>
      </div>
    `;
  }

  function choiceMarkup(options, selected, extraClass = "") {
    return `
      <div class="choice-grid ${extraClass}">
        ${options.map((option) => `
          <button
            class="choice-button${String(selected) === String(option.value) ? " is-selected" : ""}"
            type="button"
            data-value="${option.value}"
          >${option.label}</button>
        `).join("")}
      </div>
    `;
  }

  function renderChoiceStep(config) {
    content.innerHTML = `
      <div class="step-header">
        <p class="eyebrow">${config.eyebrow || "Drawing setup"}</p>
        <h2 id="step-title">${config.title}</h2>
        ${config.description ? `<p class="step-intro">${config.description}</p>` : ""}
      </div>
      ${choiceMarkup(config.options, state[config.key], config.extraClass || "")}
      ${navigationMarkup()}
    `;

    content.querySelectorAll("[data-value]").forEach((button) => {
      button.addEventListener("click", () => {
        let value = button.dataset.value;

        if (config.type === "boolean") {
          value = value === "true";
        } else if (config.type === "number") {
          value = Number(value);
        }

        const previousValue = state[config.key];
        state[config.key] = value;

        if (config.key === "family" && previousValue !== value && value === "hydraulic") {
          state.contactors = null;
        }

        if (config.key === "doors" && previousValue !== value && value === 1) {
          state.copb = null;
          state.side = null;
        }

        goNext();
      });
    });
  }

  function renderLanding() {
    content.innerHTML = `
      <div class="landing-layout">
        <div>
          <p class="eyebrow">Elevator engineering</p>
          <h1 id="step-title">Drawing Generator</h1>
          <p class="landing-copy">Build a clear drawing configuration through a short, guided setup.</p>
          <button class="primary-button" type="button" data-action="start">Start</button>
        </div>
        <div class="landing-logo" aria-hidden="true">
          <img src="assets/images/logo.png" alt="">
        </div>
      </div>
    `;
  }

  function renderOperator() {
    content.innerHTML = `
      <div class="step-header">
        <p class="eyebrow">Drawing setup</p>
        <h2 id="step-title">Operator / Prepared by</h2>
        <p class="step-intro">Enter the name that should identify who prepared this configuration.</p>
      </div>
      <form class="operator-form" id="operator-form">
        <label class="field-label" for="operator-name">Name</label>
        <input
          class="text-input"
          id="operator-name"
          name="operator"
          type="text"
          maxlength="80"
          autocomplete="name"
          placeholder="Enter operator name"
          value="${escapeHtml(state.operator)}"
          required
        >
        <p class="field-help">This will be used on the drawing when generation is connected later.</p>
        <div class="form-submit">
          <button class="primary-button" id="operator-continue" type="submit" ${state.operator.trim() ? "" : "disabled"}>Continue</button>
        </div>
      </form>
      ${navigationMarkup()}
    `;

    const form = document.getElementById("operator-form");
    const input = document.getElementById("operator-name");
    const continueButton = document.getElementById("operator-continue");

    input.addEventListener("input", () => {
      state.operator = input.value;
      continueButton.disabled = !input.value.trim();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      state.operator = input.value.trim();

      if (state.operator) {
        goNext();
      }
    });

    window.setTimeout(() => input.focus(), 0);
  }

  function getStandard() {
    if (state.en8120) {
      return "EN 81.20";
    }

    return state.family === "traction" ? "EN 81.1" : "EN 81.2";
  }

  function yesNo(value) {
    return value ? "Yes" : "No";
  }

  function titleCase(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "—";
  }

  function reviewItems() {
    const items = [
      ["Prepared by", state.operator],
      ["Family", titleCase(state.family)],
      ["EN 81.20", yesNo(state.en8120)],
      ["Applied standard", getStandard()]
    ];

    if (state.family === "traction") {
      items.push(["Contactors", state.contactors]);
    }

    items.push(["Doors", String(state.doors)]);

    if (state.doors === 2) {
      items.push(["COPB", yesNo(state.copb)]);
      items.push(["Side configuration", state.side === "a" ? "Side A only" : "Side B also"]);
    }

    items.push(["Stops", String(state.stops)]);
    items.push(["Fireman key", yesNo(state.fireman)]);
    items.push(["VIP travel", yesNo(state.vip)]);
    return items;
  }

  function renderReview() {
    const items = reviewItems();

    content.innerHTML = `
      <div class="step-header">
        <p class="eyebrow">Final check</p>
        <h2 id="step-title">Review configuration</h2>
        <p class="step-intro">Confirm the selections below before accepting the drawing setup.</p>
      </div>
      <div class="review-list">
        ${items.map(([label, value]) => `
          <div class="review-item">
            <span class="review-label">${label}</span>
            <span class="review-value">${escapeHtml(value)}</span>
          </div>
        `).join("")}
      </div>
      <div class="final-actions">
        <button class="secondary-button" type="button" data-action="back">Back</button>
        <button class="text-button cancel" type="button" data-action="cancel">Cancel</button>
        <button class="primary-button" type="button" data-action="generate">Generate Drawing</button>
      </div>
    `;
  }

  function renderSuccess() {
    content.innerHTML = `
      <div class="success-panel">
        <div class="success-icon" aria-hidden="true">&#10003;</div>
        <p class="eyebrow">Configuration complete</p>
        <h2 id="step-title">Drawing configuration accepted.</h2>
        <p class="step-intro">Backend generation will be connected later.</p>
        <div class="success-actions">
          <button class="primary-button" type="button" data-action="new">Start New Configuration</button>
          <a class="secondary-button" href="6.html">Return to Main Site</a>
        </div>
      </div>
    `;
  }

  function render() {
    updateProgress();
    content.style.animation = "none";
    void content.offsetWidth;
    content.style.animation = "";

    switch (currentStep) {
      case "landing":
        renderLanding();
        break;
      case "operator":
        renderOperator();
        break;
      case "family":
        renderChoiceStep({
          key: "family",
          title: "Hydraulic or Traction?",
          description: "Choose the elevator family for this drawing.",
          options: [
            { label: "Hydraulic", value: "hydraulic" },
            { label: "Traction", value: "traction" }
          ]
        });
        break;
      case "en8120":
        renderChoiceStep({
          key: "en8120",
          title: "EN 81.20?",
          description: "Select whether this drawing follows EN 81.20.",
          type: "boolean",
          options: [
            { label: "Yes", value: true },
            { label: "No", value: false }
          ]
        });
        break;
      case "contactors":
        renderChoiceStep({
          key: "contactors",
          title: "Contactors",
          description: "Choose the contactor control type for this traction elevator.",
          options: [
            { label: "AC", value: "AC" },
            { label: "DC", value: "DC" }
          ]
        });
        break;
      case "doors":
        renderChoiceStep({
          key: "doors",
          title: "Number of doors",
          description: "Select the door arrangement used by the elevator.",
          type: "number",
          options: [
            { label: "1 Door", value: 1 },
            { label: "2 Doors", value: 2 }
          ]
        });
        break;
      case "copb":
        renderChoiceStep({
          key: "copb",
          title: "COPB?",
          description: "Choose whether a second car operating panel is required.",
          type: "boolean",
          options: [
            { label: "Yes", value: true },
            { label: "No", value: false }
          ]
        });
        break;
      case "side":
        renderChoiceStep({
          key: "side",
          title: "Side configuration",
          description: "Select which door side configuration should be included.",
          options: [
            { label: "Side A Only", value: "a" },
            { label: "Side B Also", value: "b" }
          ]
        });
        break;
      case "stops":
        renderChoiceStep({
          key: "stops",
          title: "How many stops?",
          description: "Select the total number of elevator stops.",
          type: "number",
          extraClass: "stops-grid",
          options: [2, 3, 4, 5, 6, 7, 8].map((number) => ({ label: String(number), value: number }))
        });
        break;
      case "fireman":
        renderChoiceStep({
          key: "fireman",
          title: "Fireman key?",
          description: "Choose whether fireman key operation is required.",
          type: "boolean",
          options: [
            { label: "Yes", value: true },
            { label: "No", value: false }
          ]
        });
        break;
      case "vip":
        renderChoiceStep({
          key: "vip",
          title: "VIP travel?",
          description: "Choose whether VIP travel operation is required.",
          type: "boolean",
          options: [
            { label: "Yes", value: true },
            { label: "No", value: false }
          ]
        });
        break;
      case "review":
        renderReview();
        break;
      case "success":
        renderSuccess();
        break;
      default:
        cancelConfiguration();
        return;
    }

    bindSharedActions();

    const heading = document.getElementById("step-title");
    if (heading && currentStep !== "operator") {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }

  function bindSharedActions() {
    const start = content.querySelector('[data-action="start"]');
    const back = content.querySelector('[data-action="back"]');
    const cancel = content.querySelector('[data-action="cancel"]');
    const generate = content.querySelector('[data-action="generate"]');
    const startNew = content.querySelector('[data-action="new"]');

    if (start) {
      start.addEventListener("click", () => goTo("operator"));
    }

    if (back) {
      back.addEventListener("click", goBack);
    }

    if (cancel) {
      cancel.addEventListener("click", cancelConfiguration);
    }

    if (generate) {
      generate.addEventListener("click", () => goTo("success"));
    }

    if (startNew) {
      startNew.addEventListener("click", cancelConfiguration);
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  render();
})();
