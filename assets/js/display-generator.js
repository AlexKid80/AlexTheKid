(function () {
  "use strict";

  const API_ENDPOINT =
    "https://elevatorsbackend.onrender.com/generate-l2-simple";

  const ACCESS_SESSION = Object.freeze({
    tokenKey: "axl_lifts_token",
    expiresKey: "axl_lifts_token_expires",
    loginPage: "elogin.html"
  });

  const initialState = () => ({
    display_type: null,
    project_id: "",
    load_kg: "",
    load_persons: "",
    stops: "",
    direction_arrows: null,
    lift_in_service: null,
    fireman_mode: null,
    stop_indicator: null,
    overload_indicator: null,
    door_obstacle_indicator: null,
    real_time_clock: null
  });

  let state = initialState();
  let history = ["landing"];
  let currentStep = "landing";
  let generationError = "";
  let isGenerating = false;

  const content = document.getElementById("wizard-content");
  const progressRegion = document.getElementById("progress-region");
  const progressLabel = document.getElementById("progress-label");
  const progressPercent = document.getElementById("progress-percent");
  const progressBar = document.getElementById("progress-bar");
  const progressTrack = progressRegion.querySelector(".progress-track");

  document.getElementById("year").textContent = new Date().getFullYear();

  function clearAccessAndRedirect() {
    sessionStorage.removeItem(ACCESS_SESSION.tokenKey);
    sessionStorage.removeItem(ACCESS_SESSION.expiresKey);
    window.location.replace(ACCESS_SESSION.loginPage);
  }

  function getAccessToken() {
    const token = sessionStorage.getItem(ACCESS_SESSION.tokenKey);
    const expiresAt = Number(sessionStorage.getItem(ACCESS_SESSION.expiresKey));

    if (!token) {
      return "";
    }

    if (
      Number.isFinite(expiresAt) &&
      expiresAt > 0 &&
      Date.now() >= expiresAt
    ) {
      return "";
    }

    return token;
  }

  function getFlow() {
    if (state.display_type !== "simple") {
      return ["display-type"];
    }

    return [
      "display-type",
      "project-id",
      "cabin-load",
      "stops",
      "direction-arrows",
      "lift-in-service",
      "fireman-mode",
      "stop-indicator",
      "overload-indicator",
      "door-obstacle-indicator",
      "real-time-clock",
      "review"
    ];
  }

  function nextStepFrom(stepId) {
    const flow = getFlow();
    const index = flow.indexOf(stepId);

    return index >= 0 && index < flow.length - 1
      ? flow[index + 1]
      : "review";
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
    if (isGenerating || history.length <= 1) {
      return;
    }

    history.pop();
    currentStep = history[history.length - 1];
    generationError = "";
    render();
  }

  function cancelConfiguration() {
    if (isGenerating) {
      return;
    }

    state = initialState();
    history = ["landing"];
    currentStep = "landing";
    generationError = "";
    render();
  }

  function updateProgress() {
    const hiddenSteps = [
      "landing",
      "unsupported",
      "generating-error",
      "success"
    ];

    const isWizardStep = !hiddenSteps.includes(currentStep);
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
    progressTrack.setAttribute("aria-valuenow", String(percent));
    progressTrack.setAttribute("aria-valuetext", `Step ${index + 1} of ${flow.length}`);
  }

  function navigationMarkup() {
    return `
      <div class="step-navigation">
        <button class="text-button" type="button" data-action="back">&larr; Back</button>
        <button class="text-button cancel" type="button" data-action="cancel">Cancel</button>
      </div>
    `;
  }

  function choiceMarkup(options, selected) {
    return `
      <div class="choice-grid">
        ${options.map((option) => `
          <button
            class="choice-button${String(selected) === String(option.value) ? " is-selected" : ""}"
            type="button"
            data-value="${option.value}"
          >
            ${option.label}
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderChoiceStep(config) {
    content.innerHTML = `
      <div class="step-header">
        <p class="eyebrow">${config.eyebrow || "Display setup"}</p>
        <h2 id="step-title">${config.title}</h2>
        ${config.description ? `<p class="step-intro">${config.description}</p>` : ""}
      </div>

      ${choiceMarkup(config.options, state[config.key])}
      ${navigationMarkup()}
    `;

    content.querySelectorAll("[data-value]").forEach((button) => {
      button.addEventListener("click", () => {
        let value = button.dataset.value;

        if (config.type === "boolean") {
          value = value === "true";
        }

        const previousValue = state[config.key];
        state[config.key] = value;
        generationError = "";

        if (
          config.key === "display_type" &&
          previousValue !== value
        ) {
          state.project_id = "";
          state.load_kg = "";
          state.load_persons = "";
          state.stops = "";
          state.direction_arrows = null;
          state.lift_in_service = null;
          state.fireman_mode = null;
          state.stop_indicator = null;
          state.overload_indicator = null;
          state.door_obstacle_indicator = null;
          state.real_time_clock = null;
        }

        if (
          config.key === "display_type" &&
          value === "complex"
        ) {
          goTo("unsupported");
          return;
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
          <h1 id="step-title">Display Generator</h1>
          <p class="landing-copy">
            Build a ready-to-use lift display configuration through a short, guided setup.
          </p>
          <button class="primary-button" type="button" data-action="start">Start</button>
        </div>

        <div class="landing-logo" aria-hidden="true">
          <img src="assets/images/disp.png" alt="">
        </div>
      </div>
    `;
  }

  function isValidProjectId(value) {
    return /^TQ\d{5}$/.test(String(value).trim().toUpperCase());
  }

  function renderProjectId() {
    content.innerHTML = `
      <div class="step-header">
        <p class="eyebrow">Project identification</p>
        <h2 id="step-title">Project ID</h2>
        <p class="step-intro">Enter the lift project ID used by the display configuration.</p>
      </div>

      <form class="operator-form" id="project-id-form">
        <label class="field-label" for="project-id">
          Project ID <span class="required-mark">Required</span>
        </label>

        <input
          class="text-input lift-id-input"
          id="project-id"
          name="project_id"
          type="text"
          maxlength="7"
          autocomplete="off"
          spellcheck="false"
          placeholder="TQ37723"
          value="${escapeHtml(state.project_id)}"
          aria-describedby="project-id-help project-id-error"
          required
        >

        <p class="field-help" id="project-id-help">Format: TQ followed by exactly five digits.</p>
        <p class="field-error" id="project-id-error" aria-live="polite"></p>

        <div class="form-submit">
          <button class="primary-button" id="project-id-continue" type="submit" disabled>Continue</button>
        </div>
      </form>

      ${navigationMarkup()}
    `;

    const form = document.getElementById("project-id-form");
    const input = document.getElementById("project-id");
    const error = document.getElementById("project-id-error");
    const continueButton = document.getElementById("project-id-continue");

    function validate(showRequired = false) {
      input.value = input.value.toUpperCase();

      const hasValue = Boolean(input.value.trim());
      const valid = isValidProjectId(input.value);

      if (!valid && (hasValue || showRequired)) {
        error.textContent = hasValue
          ? "Use TQ followed by exactly five digits."
          : "Project ID is required.";
      } else {
        error.textContent = "";
      }

      input.setAttribute(
        "aria-invalid",
        String(!valid && (hasValue || showRequired))
      );

      continueButton.disabled = !valid;
      return valid;
    }

    input.addEventListener("input", () => {
      state.project_id = input.value.toUpperCase();
      validate();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      state.project_id = input.value.trim().toUpperCase();

      if (!validate(true)) {
        input.focus();
        return;
      }

      goNext();
    });

    validate();
    window.setTimeout(() => input.focus(), 0);
  }

  function validIntegerInRange(value, min, max) {
    if (String(value).trim() === "") {
      return false;
    }

    const number = Number(value);

    return (
      Number.isInteger(number) &&
      number >= min &&
      number <= max
    );
  }

  function renderCabinLoad() {
    content.innerHTML = `
      <div class="step-header lift-info-header">
        <p class="eyebrow">Cabin details</p>
        <h2 id="step-title">Cabin Load</h2>
        <p class="step-intro">Enter the nominal cabin load in kilograms and persons.</p>
      </div>

      <form class="lift-info-form" id="cabin-load-form">
        <fieldset class="lift-info-group">
          <legend><span>1</span>Nominal Load</legend>

          <div class="lift-field-grid">
            <div class="lift-field">
              <label class="field-label" for="load-kg">
                Load <span class="field-unit">kg</span>
              </label>
              <input
                class="text-input"
                id="load-kg"
                type="number"
                inputmode="numeric"
                min="0"
                max="9999"
                step="1"
                placeholder="630"
                value="${escapeHtml(state.load_kg)}"
                required
              >
              <p class="field-error" id="load-kg-error" aria-live="polite"></p>
            </div>

            <div class="lift-field">
              <label class="field-label" for="load-persons">
                Load <span class="field-unit">Persons</span>
              </label>
              <input
                class="text-input"
                id="load-persons"
                type="number"
                inputmode="numeric"
                min="0"
                max="99"
                step="1"
                placeholder="8"
                value="${escapeHtml(state.load_persons)}"
                required
              >
              <p class="field-error" id="load-persons-error" aria-live="polite"></p>
            </div>
          </div>
        </fieldset>

        <div class="lift-info-actions">
          <button class="primary-button" id="cabin-load-continue" type="submit" disabled>Continue</button>
        </div>

        ${navigationMarkup()}
      </form>
    `;

    const form = document.getElementById("cabin-load-form");
    const kgInput = document.getElementById("load-kg");
    const personsInput = document.getElementById("load-persons");
    const kgError = document.getElementById("load-kg-error");
    const personsError = document.getElementById("load-persons-error");
    const continueButton = document.getElementById("cabin-load-continue");

    function validate(showRequired = false) {
      const validKg = validIntegerInRange(kgInput.value, 0, 9999);
      const validPersons = validIntegerInRange(personsInput.value, 0, 99);

      if (!validKg && (kgInput.value.trim() || showRequired)) {
        kgError.textContent = "Use a whole number from 0 to 9999.";
      } else {
        kgError.textContent = "";
      }

      if (!validPersons && (personsInput.value.trim() || showRequired)) {
        personsError.textContent = "Use a whole number from 0 to 99.";
      } else {
        personsError.textContent = "";
      }

      kgInput.setAttribute(
        "aria-invalid",
        String(!validKg && Boolean(kgInput.value.trim() || showRequired))
      );

      personsInput.setAttribute(
        "aria-invalid",
        String(!validPersons && Boolean(personsInput.value.trim() || showRequired))
      );

      const valid = validKg && validPersons;
      continueButton.disabled = !valid;
      return valid;
    }

    function syncState() {
      state.load_kg = kgInput.value;
      state.load_persons = personsInput.value;
      validate();
    }

    kgInput.addEventListener("input", syncState);
    personsInput.addEventListener("input", syncState);

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!validate(true)) {
        const invalid = form.querySelector('[aria-invalid="true"]');
        if (invalid) {
          invalid.focus();
        }
        return;
      }

      state.load_kg = String(Number(kgInput.value));
      state.load_persons = String(Number(personsInput.value));
      goNext();
    });

    validate();
  }

  function renderStops() {
    content.innerHTML = `
      <div class="step-header">
        <p class="eyebrow">Display setup</p>
        <h2 id="step-title">Number of Stops</h2>
        <p class="step-intro">Enter the total number of lift stops from 1 to 99.</p>
      </div>

      <form class="operator-form" id="stops-form">
        <label class="field-label" for="stops">Stops</label>
        <input
          class="text-input"
          id="stops"
          type="number"
          inputmode="numeric"
          min="1"
          max="99"
          step="1"
          placeholder="3"
          value="${escapeHtml(state.stops)}"
          required
        >
        <p class="field-error" id="stops-error" aria-live="polite"></p>

        <div class="form-submit">
          <button class="primary-button" id="stops-continue" type="submit" disabled>Continue</button>
        </div>
      </form>

      ${navigationMarkup()}
    `;

    const form = document.getElementById("stops-form");
    const input = document.getElementById("stops");
    const error = document.getElementById("stops-error");
    const continueButton = document.getElementById("stops-continue");

    function validate(showRequired = false) {
      const valid = validIntegerInRange(input.value, 1, 99);

      if (!valid && (input.value.trim() || showRequired)) {
        error.textContent = "Use a whole number from 1 to 99.";
      } else {
        error.textContent = "";
      }

      input.setAttribute(
        "aria-invalid",
        String(!valid && Boolean(input.value.trim() || showRequired))
      );

      continueButton.disabled = !valid;
      return valid;
    }

    input.addEventListener("input", () => {
      state.stops = input.value;
      validate();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!validate(true)) {
        input.focus();
        return;
      }

      state.stops = String(Number(input.value));
      goNext();
    });

    validate();
  }

  function yesNo(value) {
    return value ? "Yes" : "No";
  }

  function reviewItems() {
    return [
      ["Display Type", "Simple"],
      ["Project ID", state.project_id],
      ["Cabin Load", `${state.load_kg} kg`],
      ["Persons", state.load_persons],
      ["Stops", state.stops],
      ["Direction Arrows", yesNo(state.direction_arrows)],
      ["Lift in Service", yesNo(state.lift_in_service)],
      ["Fireman Mode", yesNo(state.fireman_mode)],
      ["Stop Indicator", yesNo(state.stop_indicator)],
      ["Overload Indicator", yesNo(state.overload_indicator)],
      ["Door Obstacle Indicator", yesNo(state.door_obstacle_indicator)],
      ["Real Time Clock", yesNo(state.real_time_clock)]
    ];
  }

  function reviewListMarkup(items) {
    return `
      <div class="review-list">
        ${items.map(([label, value]) => `
          <div class="review-item">
            <span class="review-label">${label}</span>
            <span class="review-value">${escapeHtml(value)}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderReview() {
    content.innerHTML = `
      <div class="step-header">
        <p class="eyebrow">Final check</p>
        <h2 id="step-title">Review configuration</h2>
        <p class="step-intro">Confirm the selections below before generating config.ini.</p>
      </div>

      ${reviewListMarkup(reviewItems())}

      <div class="final-actions" ${isGenerating ? 'aria-busy="true"' : ""}>
        <button class="secondary-button" type="button" data-action="back" ${isGenerating ? "disabled" : ""}>Back</button>
        <button class="text-button cancel" type="button" data-action="cancel" ${isGenerating ? "disabled" : ""}>Cancel</button>
        <button class="primary-button" type="button" data-action="generate" ${isGenerating ? "disabled" : ""}>
          ${isGenerating ? "Generating config.ini..." : "Generate config.ini"}
        </button>
      </div>

      ${isGenerating ? `
        <p class="session-note" role="status">
          Generating display configuration&hellip; Please keep this page open.
        </p>
      ` : ""}
    `;
  }

  function renderUnsupported() {
    content.innerHTML = `
      <div class="success-panel">
        <div class="success-icon" aria-hidden="true">&middot;&middot;&middot;</div>
        <p class="eyebrow">Coming soon</p>
        <h2 id="step-title">Complex Display</h2>
        <p class="step-intro">
          Complex display configuration is not available in this version yet. Simple display configuration is available now.
        </p>

        <div class="success-actions">
          <button class="secondary-button" type="button" data-action="back">&larr; Back</button>
          <button class="text-button cancel" type="button" data-action="cancel">Start Over</button>
          <a class="secondary-button" href="lifts.html">Return to Main Site</a>
        </div>
      </div>
    `;
  }

  function renderGenerationError() {
    content.innerHTML = `
      <div class="success-panel" role="alert">
        <div class="success-icon" aria-hidden="true">!</div>
        <p class="eyebrow">Generation failed</p>
        <h2 id="step-title">config.ini could not be generated</h2>
        <p class="step-intro">
          ${escapeHtml(generationError || "The server did not complete the request. Please try again.")}
        </p>

        <div class="success-actions">
          <button class="primary-button" type="button" data-action="retry">Retry</button>
          <button class="secondary-button" type="button" data-action="back">&larr; Back</button>
          <button class="text-button cancel" type="button" data-action="cancel">Cancel</button>
        </div>
      </div>
    `;
  }

  function renderSuccess() {
    content.innerHTML = `
      <div class="success-panel">
        <div class="success-icon" aria-hidden="true">&#10003;</div>
        <p class="eyebrow">Configuration complete</p>
        <h2 id="step-title">config.ini generated successfully.</h2>
        <p class="step-intro">The configuration file download has started.</p>

        <div class="success-actions">
          <button class="primary-button" type="button" data-action="new">Start New Configuration</button>
          <a class="secondary-button" href="lifts.html">Return to Main Site</a>
        </div>
      </div>
    `;
  }

  function buildPayload() {
    return {
      project_id: state.project_id.trim().toUpperCase(),
      load_kg: Number(state.load_kg),
      load_persons: Number(state.load_persons),
      stops: Number(state.stops),
      direction_arrows: state.direction_arrows,
      lift_in_service: state.lift_in_service,
      fireman_mode: state.fireman_mode,
      stop_indicator: state.stop_indicator,
      overload_indicator: state.overload_indicator,
      door_obstacle_indicator: state.door_obstacle_indicator,
      real_time_clock: state.real_time_clock
    };
  }

  function payloadIsComplete(payload) {
    return (
      isValidProjectId(payload.project_id) &&
      Number.isInteger(payload.load_kg) &&
      payload.load_kg >= 0 &&
      payload.load_kg <= 9999 &&
      Number.isInteger(payload.load_persons) &&
      payload.load_persons >= 0 &&
      payload.load_persons <= 99 &&
      Number.isInteger(payload.stops) &&
      payload.stops >= 1 &&
      payload.stops <= 99 &&
      typeof payload.direction_arrows === "boolean" &&
      typeof payload.lift_in_service === "boolean" &&
      typeof payload.fireman_mode === "boolean" &&
      typeof payload.stop_indicator === "boolean" &&
      typeof payload.overload_indicator === "boolean" &&
      typeof payload.door_obstacle_indicator === "boolean" &&
      typeof payload.real_time_clock === "boolean"
    );
  }

  async function readServerError(response) {
    try {
      const data = await response.clone().json();

      if (
        data &&
        typeof data.error === "string" &&
        data.error.trim()
      ) {
        return data.error.trim();
      }
    } catch (error) {
    }

    try {
      const message = (await response.text()).trim();

      if (message) {
        return message;
      }
    } catch (error) {
    }

    return `The server returned an error (${response.status}).`;
  }

  function downloadFile(blob, filename) {
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = downloadUrl;
    link.download = filename;
    link.hidden = true;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(
      () => URL.revokeObjectURL(downloadUrl),
      1000
    );
  }

  async function generateConfiguration() {
    if (isGenerating) {
      return;
    }

    if (currentStep === "generating-error") {
      if (history[history.length - 1] === "generating-error") {
        history.pop();
      }
      currentStep = "review";
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      clearAccessAndRedirect();
      return;
    }

    const payload = buildPayload();

    if (!payloadIsComplete(payload)) {
      generationError =
        "The configuration is incomplete or invalid. Please go back and review your selections.";
      goTo("generating-error");
      return;
    }

    isGenerating = true;
    generationError = "";
    render();

    try {
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/octet-stream, application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
      });

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        clearAccessAndRedirect();
        return;
      }

      if (!response.ok) {
        throw new Error(await readServerError(response));
      }

      const configBlob = await response.blob();

      if (configBlob.size === 0) {
        throw new Error("The server returned an empty config.ini file.");
      }

      downloadFile(configBlob, "config.ini");
      isGenerating = false;
      goTo("success");

    } catch (error) {
      isGenerating = false;
      generationError = error instanceof Error
        ? error.message
        : "The display configuration request failed.";

      if (error instanceof TypeError) {
        generationError =
          "Could not reach the display configuration server. Please try again in a moment.";
      }

      goTo("generating-error");
    }
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

      case "display-type":
        renderChoiceStep({
          key: "display_type",
          title: "Type of Display",
          description: "Choose the display configuration family.",
          options: [
            { label: "Simple", value: "simple" },
            { label: "Complex", value: "complex" }
          ]
        });
        break;

      case "project-id":
        renderProjectId();
        break;

      case "cabin-load":
        renderCabinLoad();
        break;

      case "stops":
        renderStops();
        break;

      case "direction-arrows":
        renderChoiceStep({
          key: "direction_arrows",
          title: "Direction Arrows",
          description: "Show the up and down direction arrows on the display?",
          type: "boolean",
          options: [
            { label: "Yes", value: true },
            { label: "No", value: false }
          ]
        });
        break;

      case "lift-in-service":
        renderChoiceStep({
          key: "lift_in_service",
          title: "Lift in Service",
          description: "Enable the lift-in-service indicator?",
          type: "boolean",
          options: [
            { label: "Yes", value: true },
            { label: "No", value: false }
          ]
        });
        break;

      case "fireman-mode":
        renderChoiceStep({
          key: "fireman_mode",
          title: "Fireman Mode",
          description: "Enable the fireman mode indicator?",
          type: "boolean",
          options: [
            { label: "Yes", value: true },
            { label: "No", value: false }
          ]
        });
        break;

      case "stop-indicator":
        renderChoiceStep({
          key: "stop_indicator",
          title: "Stop Indicator",
          description: "Enable the stop indicator?",
          type: "boolean",
          options: [
            { label: "Yes", value: true },
            { label: "No", value: false }
          ]
        });
        break;

      case "overload-indicator":
        renderChoiceStep({
          key: "overload_indicator",
          title: "Overload Indicator",
          description: "Enable the overload indicator?",
          type: "boolean",
          options: [
            { label: "Yes", value: true },
            { label: "No", value: false }
          ]
        });
        break;

      case "door-obstacle-indicator":
        renderChoiceStep({
          key: "door_obstacle_indicator",
          title: "Door Obstacle Indicator",
          description: "Enable the door obstacle indicator?",
          type: "boolean",
          options: [
            { label: "Yes", value: true },
            { label: "No", value: false }
          ]
        });
        break;

      case "real-time-clock":
        renderChoiceStep({
          key: "real_time_clock",
          title: "Real Time Clock",
          description: "Enable the real-time clock indicator?",
          type: "boolean",
          options: [
            { label: "Yes", value: true },
            { label: "No", value: false }
          ]
        });
        break;

      case "review":
        if (state.display_type !== "simple") {
          goTo("unsupported", false);
          return;
        }
        renderReview();
        break;

      case "unsupported":
        renderUnsupported();
        break;

      case "generating-error":
        renderGenerationError();
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

    if (heading && currentStep !== "landing") {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }

  function bindSharedActions() {
    const start = content.querySelector('[data-action="start"]');
    const back = content.querySelector('[data-action="back"]');
    const cancel = content.querySelector('[data-action="cancel"]');
    const generate = content.querySelector('[data-action="generate"]');
    const retry = content.querySelector('[data-action="retry"]');
    const startNew = content.querySelector('[data-action="new"]');

    if (start) {
      start.addEventListener("click", () => goTo("display-type"));
    }

    if (back) {
      back.addEventListener("click", goBack);
    }

    if (cancel) {
      cancel.addEventListener("click", cancelConfiguration);
    }

    if (generate) {
      generate.addEventListener("click", generateConfiguration);
    }

    if (retry) {
      retry.addEventListener("click", generateConfiguration);
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
