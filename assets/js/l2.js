(function () {
  "use strict";

  const API_ENDPOINTS = Object.freeze({
    clients: "https://elevatorsbackend.onrender.com/l2-clients",
    generate: "https://elevatorsbackend.onrender.com/generate-l2-client"
  });

  const ACCESS_SESSION = Object.freeze({
    tokenKey: "axl_lifts_token",
    expiresKey: "axl_lifts_token_expires",
    loginPage: "elogin.html"
  });

  const initialState = () => ({
    client_id: "",
    lift_type: null,
    car_speed: "",
    project_id: "",
    load_kg: "",
    load_persons: "",
    stops: "",
    show_speed: null
  });

  let state = initialState();
  let clients = [];
  let clientsLoading = false;
  let clientsError = "";
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

  function selectedClient() {
    return clients.find((client) => client.id === state.client_id) || null;
  }

  function clientNeedsLiftType(client) {
    return Boolean(client && client.requires_lift_type === true);
  }

  function clientNeedsRoutingSpeed(client) {
    return Boolean(
      client &&
      client.group === 4 &&
      state.lift_type === "MRL"
    );
  }

  function getFlow() {
    const flow = ["client-select"];
    const client = selectedClient();

    if (!client) {
      return flow;
    }

    if (clientNeedsLiftType(client)) {
      flow.push("lift-type");
    }

    if (clientNeedsRoutingSpeed(client)) {
      flow.push("routing-speed");
    }

    flow.push(
      "project-id",
      "cabin-load",
      "stops",
      "show-speed",
      "review"
    );

    return flow;
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
    progressTrack.setAttribute(
      "aria-valuetext",
      `Step ${index + 1} of ${flow.length}`
    );
  }

  function navigationMarkup() {
    return `
      <div class="step-navigation">
        <button class="text-button" type="button" data-action="back">&larr; Back</button>
        <button class="text-button cancel" type="button" data-action="cancel">Cancel</button>
      </div>
    `;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function humanizeClientName(client) {
    const value = client && client.name
      ? client.name
      : client.id.replace(/^\d+_/, "");

    return String(value).replace(/_/g, " ");
  }

  function clientNumber(client) {
    const match = String(client.id).match(/^(\d+)_/);
    return match ? match[1] : "---";
  }

  function clientBadge(client) {
    switch (client.mode) {
      case "SHARED":
        return { label: "Shared L2", className: "mode-shared" };
      case "MRL_ONLY":
        return { label: "MRL", className: "mode-mrl" };
      case "HAI_ONLY":
        return { label: "Hydraulic", className: "mode-hai" };
      case "BOTH":
        return { label: "MRL / HYD", className: "mode-both" };
      case "SPECIAL":
        return { label: "Special", className: "mode-special" };
      default:
        return { label: "Client", className: "" };
    }
  }

  function choiceMarkup(options, selected) {
    return `
      <div class="choice-grid">
        ${options.map((option) => `
          <button
            class="choice-button${String(selected) === String(option.value) ? " is-selected" : ""}"
            type="button"
            data-value="${escapeHtml(option.value)}"
          >
            ${escapeHtml(option.label)}
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderChoiceStep(config) {
    content.innerHTML = `
      <div class="step-header">
        <p class="eyebrow">${escapeHtml(config.eyebrow || "Client display setup")}</p>
        <h2 id="step-title">${escapeHtml(config.title)}</h2>
        ${config.description ? `<p class="step-intro">${escapeHtml(config.description)}</p>` : ""}
      </div>

      ${choiceMarkup(config.options, state[config.key])}
      ${config.extraMarkup || ""}
      ${navigationMarkup()}
    `;

    content.querySelectorAll("[data-value]").forEach((button) => {
      button.addEventListener("click", () => {
        let value = button.dataset.value;

        if (config.type === "boolean") {
          value = value === "true";
        }

        state[config.key] = value;
        generationError = "";

        if (config.key === "lift_type" && value !== "MRL") {
          state.car_speed = "";
        }

        goNext();
      });
    });
  }

  function renderLanding() {
    content.innerHTML = `
      <div class="landing-layout">
        <div>
          <p class="eyebrow">Approved client profiles</p>
          <h1 id="step-title">Client L2 Generator</h1>
          <p class="landing-copy">
            Select an approved client layout, enter the project values and generate the complete L2 display package.
          </p>
          <button class="primary-button" type="button" data-action="start">Start</button>
        </div>

        <div class="landing-logo" aria-hidden="true">
          <img src="assets/images/disp.png" alt="">
        </div>
      </div>
    `;
  }

  function clientCardsMarkup(query = "") {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = clients.filter((client) => {
      const haystack = [
        client.id,
        client.name,
        humanizeClientName(client),
        client.mode
      ].join(" ").toLowerCase();

      return !normalizedQuery || haystack.includes(normalizedQuery);
    });

    if (!filtered.length) {
      return `
        <p class="client-empty">
          No client profile matches <strong>${escapeHtml(query)}</strong>.
        </p>
      `;
    }

    return filtered.map((client) => {
      const badge = clientBadge(client);

      return `
        <button
          class="client-card"
          type="button"
          data-client-id="${escapeHtml(client.id)}"
        >
          <span class="client-card-top">
            <span class="client-number">#${escapeHtml(clientNumber(client))}</span>
            <span class="client-mode-badge ${badge.className}">${escapeHtml(badge.label)}</span>
          </span>
          <span class="client-name">${escapeHtml(humanizeClientName(client))}</span>
        </button>
      `;
    }).join("");
  }

  function bindClientCards() {
    content.querySelectorAll("[data-client-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextClientId = button.dataset.clientId;

        if (state.client_id !== nextClientId) {
          state.client_id = nextClientId;
          state.lift_type = null;
          state.car_speed = "";
        }

        generationError = "";
        goNext();
      });
    });
  }

  function renderClientSelect() {
    if (clientsLoading) {
      content.innerHTML = `
        <div class="step-header">
          <p class="eyebrow">Client database</p>
          <h2 id="step-title">Loading Client Profiles</h2>
          <p class="step-intro">Reading the approved client list from the protected backend.</p>
        </div>

        <div class="client-directory">
          <div class="client-directory-state">
            <strong>Connecting to client database...</strong>
            The profile list will appear as soon as the server responds.
          </div>
        </div>

        ${navigationMarkup()}
      `;
      return;
    }

    if (clientsError) {
      content.innerHTML = `
        <div class="step-header">
          <p class="eyebrow">Client database</p>
          <h2 id="step-title">Client Profiles Unavailable</h2>
          <p class="step-intro">${escapeHtml(clientsError)}</p>
        </div>

        <div class="client-directory">
          <div class="client-directory-state">
            <strong>Could not load the client database.</strong>
            <button class="primary-button" type="button" data-action="retry-clients">Retry</button>
          </div>
        </div>

        ${navigationMarkup()}
      `;
      return;
    }

    content.innerHTML = `
      <div class="step-header">
        <p class="eyebrow">Client database</p>
        <h2 id="step-title">Select Client</h2>
        <p class="step-intro">
          Choose the approved client profile. Layout, graphics, colours and indicator positions are preset.
        </p>
      </div>

      <div class="client-directory">
        <div class="client-directory-header">
          <span class="client-directory-label">Client Profile Database</span>
          <span class="client-directory-count">${clients.length} profiles online</span>
        </div>

        <div class="client-search-wrap">
          <span class="client-search-icon" aria-hidden="true">&#9906;</span>
          <input
            class="client-search"
            id="client-search"
            type="search"
            autocomplete="off"
            placeholder="Search client name or number..."
            aria-label="Search clients"
          >
        </div>

        <div class="client-grid" id="client-grid">
          ${clientCardsMarkup()}
        </div>
      </div>

      ${navigationMarkup()}
    `;

    const input = document.getElementById("client-search");
    const grid = document.getElementById("client-grid");

    bindClientCards();

    input.addEventListener("input", () => {
      grid.innerHTML = clientCardsMarkup(input.value);
      bindClientCards();
    });

    window.setTimeout(() => input.focus(), 0);
  }

  function isValidProjectId(value) {
    return /^TQ\d{5}$/.test(String(value).trim().toUpperCase());
  }

  function renderProjectId() {
    content.innerHTML = `
      <div class="step-header">
        <p class="eyebrow">Project identification</p>
        <h2 id="step-title">Project ID</h2>
        <p class="step-intro">Enter the lift project ID for this client display package.</p>
      </div>

      <form class="operator-form" id="project-id-form">
        <label class="field-label" for="project-id">
          Project ID <span class="required-mark">Required</span>
        </label>

        <input
          class="text-input lift-id-input"
          id="project-id"
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

    return Number.isInteger(number) && number >= min && number <= max;
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

      kgError.textContent =
        !validKg && (kgInput.value.trim() || showRequired)
          ? "Use a whole number from 0 to 9999."
          : "";

      personsError.textContent =
        !validPersons && (personsInput.value.trim() || showRequired)
          ? "Use a whole number from 0 to 99."
          : "";

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
        <p class="eyebrow">Lift structure</p>
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
          placeholder="8"
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

      error.textContent =
        !valid && (input.value.trim() || showRequired)
          ? "Use a whole number from 1 to 99."
          : "";

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

  function validRoutingSpeed(value) {
    if (String(value).trim() === "") {
      return false;
    }

    const number = Number(value);
    return Number.isFinite(number) && number > 0;
  }

  function renderRoutingSpeed() {
    content.innerHTML = `
      <div class="step-header">
        <p class="eyebrow">SARL traction routing</p>
        <h2 id="step-title">Car Speed</h2>
        <p class="step-intro">
          Enter the lift car speed. This value is used only to select the correct SARL traction preset.
        </p>
      </div>

      <form class="operator-form" id="routing-speed-form">
        <label class="field-label" for="routing-speed">
          Car Speed <span class="field-unit">m/s</span>
        </label>

        <input
          class="text-input"
          id="routing-speed"
          type="number"
          inputmode="decimal"
          min="0.01"
          step="0.01"
          placeholder="1.00"
          value="${escapeHtml(state.car_speed)}"
          required
        >

        <p class="field-help">
          1.00 m/s or below uses MRL. Above 1.00 m/s uses MRL1.
        </p>
        <p class="field-error" id="routing-speed-error" aria-live="polite"></p>

        <div class="form-submit">
          <button class="primary-button" id="routing-speed-continue" type="submit" disabled>Continue</button>
        </div>
      </form>

      ${navigationMarkup()}
    `;

    const form = document.getElementById("routing-speed-form");
    const input = document.getElementById("routing-speed");
    const error = document.getElementById("routing-speed-error");
    const continueButton = document.getElementById("routing-speed-continue");

    function validate(showRequired = false) {
      const valid = validRoutingSpeed(input.value);

      error.textContent =
        !valid && (input.value.trim() || showRequired)
          ? "Enter a car speed greater than 0."
          : "";

      input.setAttribute(
        "aria-invalid",
        String(!valid && Boolean(input.value.trim() || showRequired))
      );

      continueButton.disabled = !valid;
      return valid;
    }

    input.addEventListener("input", () => {
      state.car_speed = input.value;
      validate();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!validate(true)) {
        input.focus();
        return;
      }

      state.car_speed = String(Number(input.value));
      goNext();
    });

    validate();
  }

  function resolvedPreset(client) {
    if (!client) {
      return "";
    }

    if (client.group === 0) {
      return "L2";
    }

    if (client.group === 1) {
      return "MRL";
    }

    if (client.group === 2) {
      return "HAI";
    }

    if (client.group === 3) {
      return state.lift_type || "";
    }

    if (client.group === 4) {
      if (state.lift_type === "HAI") {
        return "HAI";
      }

      if (state.lift_type === "MRL" && validRoutingSpeed(state.car_speed)) {
        return Number(state.car_speed) > 1.0 ? "MRL1" : "MRL";
      }
    }

    return "";
  }

  function yesNo(value) {
    return value === true ? "Yes" : "No";
  }

  function reviewItem(label, value) {
    return `
      <div class="review-item">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `;
  }

  function renderReview() {
    const client = selectedClient();
    const preset = resolvedPreset(client);

    const items = [
      ["Client", humanizeClientName(client)],
      ["Preset", preset],
      ["Project ID", state.project_id.trim().toUpperCase()],
      ["Cabin Load", `${Number(state.load_kg)} kg / ${Number(state.load_persons)} persons`],
      ["Stops", String(Number(state.stops))],
      ["Show Car Speed", yesNo(state.show_speed)]
    ];

    if (clientNeedsLiftType(client)) {
      items.splice(
        2,
        0,
        ["Lift Type", state.lift_type === "HAI" ? "Hydraulic" : "Traction / MRL"]
      );
    }

    if (clientNeedsRoutingSpeed(client)) {
      items.splice(
        clientNeedsLiftType(client) ? 3 : 2,
        0,
        ["Routing Speed", `${Number(state.car_speed)} m/s`]
      );
    }

    content.innerHTML = `
      <div class="step-header">
        <p class="eyebrow">Final check</p>
        <h2 id="step-title">Review Configuration</h2>
        <p class="step-intro">
          Confirm the project values before generating the approved client display package.
        </p>
      </div>

      <div class="review-list">
        ${items.map(([label, value]) => reviewItem(label, value)).join("")}
      </div>

      <div class="preset-summary">
        <span>Resolved backend preset</span>
        <strong>${escapeHtml(client.id)} / ${escapeHtml(preset)}</strong>
      </div>

      <div class="final-actions">
        <button class="primary-button" type="button" data-action="generate">
          ${isGenerating ? "Generating files..." : "Generate Files"}
        </button>
        <button class="secondary-button" type="button" data-action="back">&larr; Back</button>
        <button class="text-button cancel" type="button" data-action="cancel">Cancel</button>
      </div>
    `;
  }

  function renderGenerationError() {
    content.innerHTML = `
      <div class="success-panel">
        <div class="success-icon error-icon" aria-hidden="true">!</div>
        <p class="eyebrow">Generation failed</p>
        <h2 id="step-title">The client display package could not be generated</h2>
        <p class="step-intro">
          ${escapeHtml(generationError || "The server did not complete the request. Please try again.")}
        </p>

        <div class="success-actions">
          <button class="primary-button" type="button" data-action="retry-generation">Retry</button>
          <button class="secondary-button" type="button" data-action="back">&larr; Back</button>
          <button class="text-button cancel" type="button" data-action="cancel">Cancel</button>
        </div>
      </div>
    `;
  }

  function renderSuccess() {
    const filename = `${state.project_id.trim().toUpperCase()}_L2.zip`;

    content.innerHTML = `
      <div class="success-panel">
        <div class="success-icon" aria-hidden="true">&#10003;</div>
        <p class="eyebrow">Client package complete</p>
        <h2 id="step-title">${escapeHtml(filename)} generated successfully.</h2>
        <p class="step-intro">The download has started.</p>

        <div class="success-actions">
          <button class="primary-button" type="button" data-action="new">Start New Configuration</button>
          <a class="secondary-button" href="lifts.html">Return to Main Site</a>
        </div>
      </div>
    `;
  }

  function buildPayload() {
    const client = selectedClient();

    const payload = {
      client_id: state.client_id,
      project_id: state.project_id.trim().toUpperCase(),
      load_kg: Number(state.load_kg),
      load_persons: Number(state.load_persons),
      stops: Number(state.stops),
      show_speed: state.show_speed
    };

    if (clientNeedsLiftType(client)) {
      payload.lift_type = state.lift_type;
    }

    if (clientNeedsRoutingSpeed(client)) {
      payload.car_speed = Number(state.car_speed);
    }

    return payload;
  }

  function payloadIsComplete(payload) {
    const client = selectedClient();

    if (!client) {
      return false;
    }

    if (
      !isValidProjectId(payload.project_id) ||
      !Number.isInteger(payload.load_kg) ||
      payload.load_kg < 0 ||
      payload.load_kg > 9999 ||
      !Number.isInteger(payload.load_persons) ||
      payload.load_persons < 0 ||
      payload.load_persons > 99 ||
      !Number.isInteger(payload.stops) ||
      payload.stops < 1 ||
      payload.stops > 99 ||
      typeof payload.show_speed !== "boolean"
    ) {
      return false;
    }

    if (
      clientNeedsLiftType(client) &&
      payload.lift_type !== "MRL" &&
      payload.lift_type !== "HAI"
    ) {
      return false;
    }

    if (
      clientNeedsRoutingSpeed(client) &&
      !validRoutingSpeed(payload.car_speed)
    ) {
      return false;
    }

    return true;
  }

  async function readServerError(response) {
    try {
      const data = await response.clone().json();

      if (data && typeof data.error === "string" && data.error.trim()) {
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

  async function loadClients() {
    if (clientsLoading) {
      return;
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      clearAccessAndRedirect();
      return;
    }

    clientsLoading = true;
    clientsError = "";

    if (currentStep === "client-select") {
      render();
    }

    try {
      const response = await fetch(API_ENDPOINTS.clients, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        cache: "no-store"
      });

      if (response.status === 401 || response.status === 403) {
        clearAccessAndRedirect();
        return;
      }

      if (!response.ok) {
        throw new Error(await readServerError(response));
      }

      const data = await response.json();

      if (!data || !Array.isArray(data.clients)) {
        throw new Error("The server returned an invalid client list.");
      }

      clients = data.clients.slice().sort((a, b) =>
        String(a.id).localeCompare(String(b.id))
      );

      if (!clients.length) {
        throw new Error("No client profiles are available.");
      }

      clientsLoading = false;
      clientsError = "";

      if (currentStep === "client-select") {
        render();
      }

    } catch (error) {
      clientsLoading = false;
      clientsError = error instanceof Error
        ? error.message
        : "Could not load the client database.";

      if (error instanceof TypeError) {
        clientsError =
          "Could not reach the client database server. Please try again in a moment.";
      }

      if (currentStep === "client-select") {
        render();
      }
    }
  }

  async function generateConfiguration() {
    if (isGenerating) {
      return;
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

    const filename = `${payload.project_id}_L2.zip`;

    isGenerating = true;
    generationError = "";
    render();

    try {
      const response = await fetch(API_ENDPOINTS.generate, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/zip, application/octet-stream, application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
      });

      if (response.status === 401 || response.status === 403) {
        clearAccessAndRedirect();
        return;
      }

      if (!response.ok) {
        throw new Error(await readServerError(response));
      }

      const generatedBlob = await response.blob();

      if (generatedBlob.size === 0) {
        throw new Error("The server returned an empty generated file.");
      }

      downloadFile(generatedBlob, filename);
      isGenerating = false;
      goTo("success");

    } catch (error) {
      isGenerating = false;
      generationError = error instanceof Error
        ? error.message
        : "The client display generation request failed.";

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

      case "client-select":
        renderClientSelect();
        break;

      case "lift-type":
        renderChoiceStep({
          key: "lift_type",
          title: "Lift Type",
          description: "This client has separate approved files. Choose the installation type.",
          options: [
            { label: "Traction / MRL", value: "MRL" },
            { label: "Hydraulic / HAI", value: "HAI" }
          ]
        });
        break;

      case "routing-speed":
        renderRoutingSpeed();
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

      case "show-speed":
        renderChoiceStep({
          key: "show_speed",
          title: "Show Car Speed",
          description: "Show the live car speed information on this client display?",
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

      case "generating-error":
        renderGenerationError();
        break;

      case "success":
        renderSuccess();
        break;

      default:
        currentStep = "landing";
        renderLanding();
        break;
    }
  }

  content.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    const action = button.dataset.action;

    if (action === "start") {
      goTo("client-select");
      return;
    }

    if (action === "back") {
      goBack();
      return;
    }

    if (action === "cancel") {
      cancelConfiguration();
      return;
    }

    if (action === "retry-clients") {
      loadClients();
      return;
    }

    if (action === "generate" || action === "retry-generation") {
      generateConfiguration();
      return;
    }

    if (action === "new") {
      cancelConfiguration();
    }
  });

  render();
  loadClients();
})();
