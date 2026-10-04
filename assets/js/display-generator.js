(function () {
  "use strict";

  const API_ENDPOINTS = Object.freeze({
    simple: "https://elevatorsbackend.onrender.com/generate-l2-simple",
    complex: "https://elevatorsbackend.onrender.com/generate-l2-complex"
  });

  const COLOR_PALETTE = Object.freeze([
    { name: "White", value: "#FFFFFF" },
    { name: "Silver", value: "#C0C0C0" },
    { name: "Olive Gold", value: "#808040" },
    { name: "Olive", value: "#808000" },
    { name: "Red", value: "#FF0000" },
    { name: "Green", value: "#008000" },
    { name: "Blue", value: "#0000FF" },
    { name: "Yellow", value: "#FFFF00" },
    { name: "Cyan", value: "#00FFFF" },
    { name: "Magenta", value: "#FF00FF" }
  ]);

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
    photo_indicator: null,
    door_obstacle_indicator: null,
    real_time_clock: null,
    show_car_speed: null,
    nominal_speed: "",
    time_color: "#808040",
    real_speed_color: "#808040",
    cabin_load_color: "#808040",
    lift_id_color: "#808040",
    speed_message_color: "#C0C0C0",
    nominal_speed_color: "#808000",
    lift_indicators_color: "#808040",
    floor_indicator_color: "#C0C0C0"
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
    if (state.display_type === "simple") {
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

    if (state.display_type === "complex") {
      const flow = [
        "display-type",
        "project-id",
        "cabin-load",
        "stops",
        "direction-arrows",
        "lift-in-service",
        "fireman-mode",
        "stop-indicator",
        "overload-indicator",
        "photo-indicator",
        "door-obstacle-indicator",
        "show-car-speed"
      ];

      if (state.show_car_speed === true) {
        flow.push("nominal-speed");
      }

      flow.push("display-colors", "preview");
      return flow;
    }

    return ["display-type"];
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

        if (config.key === "display_type" && previousValue !== value) {
          const fresh = initialState();
          const selectedType = value;
          state = fresh;
          state.display_type = selectedType;
        }

        if (config.key === "show_car_speed" && value === false) {
          state.nominal_speed = "";
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
    const minStops = state.display_type === "complex" ? 2 : 1;

    content.innerHTML = `
      <div class="step-header">
        <p class="eyebrow">Display setup</p>
        <h2 id="step-title">Number of Stops</h2>
        <p class="step-intro">Enter the total number of lift stops from ${minStops} to 99.</p>
      </div>

      <form class="operator-form" id="stops-form">
        <label class="field-label" for="stops">Stops</label>
        <input
          class="text-input"
          id="stops"
          type="number"
          inputmode="numeric"
          min="${minStops}"
          max="99"
          step="1"
          placeholder="${minStops === 2 ? "8" : "3"}"
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
      const valid = validIntegerInRange(input.value, minStops, 99);

      if (!valid && (input.value.trim() || showRequired)) {
        error.textContent = `Use a whole number from ${minStops} to 99.`;
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

  function isValidNominalSpeed(value) {
    if (String(value).trim() === "") {
      return false;
    }

    const number = Number(value);
    return Number.isFinite(number) && number >= 0.10 && number <= 4.00;
  }

  function renderNominalSpeed() {
    content.innerHTML = `
      <div class="step-header">
        <p class="eyebrow">Speed display</p>
        <h2 id="step-title">Nominal Car Speed</h2>
        <p class="step-intro">Enter the lift nominal speed from 0.10 to 4.00 m/s.</p>
      </div>

      <form class="operator-form" id="nominal-speed-form">
        <label class="field-label" for="nominal-speed">
          Nominal Speed <span class="field-unit">m/s</span>
        </label>
        <input
          class="text-input"
          id="nominal-speed"
          type="number"
          inputmode="decimal"
          min="0.10"
          max="4.00"
          step="0.01"
          placeholder="1.00"
          value="${escapeHtml(state.nominal_speed)}"
          required
        >
        <p class="field-help">Allowed range: 0.10 to 4.00 m/s.</p>
        <p class="field-error" id="nominal-speed-error" aria-live="polite"></p>

        <div class="form-submit">
          <button class="primary-button" id="nominal-speed-continue" type="submit" disabled>Continue</button>
        </div>
      </form>

      ${navigationMarkup()}
    `;

    const form = document.getElementById("nominal-speed-form");
    const input = document.getElementById("nominal-speed");
    const error = document.getElementById("nominal-speed-error");
    const continueButton = document.getElementById("nominal-speed-continue");

    function validate(showRequired = false) {
      const valid = isValidNominalSpeed(input.value);

      if (!valid && (input.value.trim() || showRequired)) {
        error.textContent = input.value.trim()
          ? "Use a value from 0.10 to 4.00 m/s."
          : "Nominal speed is required.";
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
      state.nominal_speed = input.value;
      validate();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!validate(true)) {
        input.focus();
        return;
      }

      state.nominal_speed = Number(input.value).toFixed(2);
      goNext();
    });

    validate();
  }

  function colorOptions(selected) {
    return COLOR_PALETTE.map((color) => `
      <option value="${color.value}"${color.value === selected ? " selected" : ""}>
        ${color.name}
      </option>
    `).join("");
  }

  function colorFieldMarkup(key, label, description) {
    return `
      <div class="color-field">
        <div class="color-copy">
          <label class="field-label" for="color-${key}">${label}</label>
          <p>${description}</p>
        </div>
        <div class="color-control">
          <span class="color-swatch" data-swatch="${key}" style="--swatch:${state[key]}"></span>
          <select class="color-select" id="color-${key}" data-color-key="${key}">
            ${colorOptions(state[key])}
          </select>
        </div>
      </div>
    `;
  }

  function renderDisplayColors() {
    const speedFields = state.show_car_speed === true
      ? `
        ${colorFieldMarkup("real_speed_color", "Real Speed", "Live speed value received from the CAN bus.")}
        ${colorFieldMarkup("speed_message_color", "Speed Messages", "Car speed and nominal-speed message text.")}
        ${colorFieldMarkup("nominal_speed_color", "Nominal Speed", "The nominal speed value entered in the wizard.")}
      `
      : "";

    content.innerHTML = `
      <div class="step-header color-step-header">
        <p class="eyebrow">Display appearance</p>
        <h2 id="step-title">Display Colors</h2>
        <p class="step-intro">Choose the display colors, then open Preview to check the final look before generating the files.</p>
      </div>

      <div class="color-form" aria-label="Display color selections">
        ${colorFieldMarkup("time_color", "Time Display", "Clock color. Time is always enabled on Default Display.")}
        ${colorFieldMarkup("cabin_load_color", "Cabin Load", "Cabin kilograms and persons.")}
        ${colorFieldMarkup("lift_id_color", "Lift ID", "Project ID shown on the display.")}
        ${speedFields}
        ${colorFieldMarkup("lift_indicators_color", "Lift Indicators", "Shared color for the editable lift-indicator family.")}
        ${colorFieldMarkup("floor_indicator_color", "Floor Indicator", "Large floor-number color.")}
      </div>

      <div class="final-actions color-actions">
        <button class="secondary-button" type="button" data-action="back">&larr; Back</button>
        <button class="text-button cancel" type="button" data-action="cancel">Cancel</button>
        <button class="primary-button" type="button" data-action="preview">Preview Display</button>
      </div>
    `;

    content.querySelectorAll("[data-color-key]").forEach((select) => {
      select.addEventListener("change", () => {
        const key = select.dataset.colorKey;
        state[key] = select.value;
        const swatch = content.querySelector(`[data-swatch="${key}"]`);
        if (swatch) {
          swatch.style.setProperty("--swatch", select.value);
        }
      });
    });
  }

  function renderPreview() {
    const speedMarkup = state.show_car_speed === true
      ? `
        <div class="display-preview-speed">
          <div class="display-preview-speed-row">
            <span class="preview-speed-label" style="color:${state.speed_message_color}">Car Real Speed</span>
            <strong style="color:${state.real_speed_color}">0.65</strong>
            <span class="preview-speed-unit" style="color:${state.speed_message_color}">m/s</span>
          </div>
          <div class="display-preview-speed-row nominal-row">
            <span class="preview-speed-label" style="color:${state.speed_message_color}">Nominal Speed</span>
            <strong style="color:${state.nominal_speed_color}">${Number(state.nominal_speed).toFixed(2)}</strong>
            <span class="preview-speed-unit" style="color:${state.speed_message_color}">m/s</span>
          </div>
        </div>
      `
      : `<div class="display-preview-speed is-mask-only" aria-hidden="true"></div>`;

    content.innerHTML = `
      <div class="step-header preview-step-header">
        <p class="eyebrow">Final visual check</p>
        <h2 id="step-title">Display Preview</h2>
        <p class="step-intro">Check the selected colors and values. The floor number, clock time and live CAN speed are preview examples.</p>
      </div>

      <div class="display-preview-wrap">
        <div class="display-preview" role="img" aria-label="Preview of the configured lift display">
          <img src="assets/images/preview.png" alt="" aria-hidden="true">
          <div class="display-preview-idload">
            <div class="display-preview-id" style="color:${state.lift_id_color}">S/N:${escapeHtml(state.project_id)}</div>
            <div class="display-preview-load" style="color:${state.cabin_load_color}">${escapeHtml(state.load_kg)}Kgs ${escapeHtml(state.load_persons)}P</div>
          </div>
          ${speedMarkup}
          <div class="display-preview-stop" style="--indicator:${state.lift_indicators_color}">
            <span>STOP</span>
          </div>
          <div class="display-preview-floor" style="color:${state.floor_indicator_color}">1</div>
          <div class="display-preview-time" style="color:${state.time_color}">13:00</div>
        </div>
      </div>

      <div class="preview-note">
        <span><strong>Project:</strong> ${escapeHtml(state.project_id)}</span>
        <span><strong>Load:</strong> ${escapeHtml(state.load_kg)} kg / ${escapeHtml(state.load_persons)} persons</span>
        <span><strong>Stops:</strong> ${escapeHtml(state.stops)}</span>
        <span><strong>Speed:</strong> ${state.show_car_speed ? `${Number(state.nominal_speed).toFixed(2)} m/s nominal` : "Not shown"}</span>
      </div>

      <div class="final-actions preview-actions" ${isGenerating ? 'aria-busy="true"' : ""}>
        <button class="secondary-button" type="button" data-action="back" ${isGenerating ? "disabled" : ""}>&larr; Back to Colors</button>
        <button class="text-button cancel" type="button" data-action="cancel" ${isGenerating ? "disabled" : ""}>Cancel</button>
        <button class="primary-button" type="button" data-action="generate" ${isGenerating ? "disabled" : ""}>
          ${isGenerating ? "Generating files..." : "Generate Files"}
        </button>
      </div>

      ${isGenerating ? `
        <p class="session-note" role="status">Generating the Default Display package&hellip; Please keep this page open.</p>
      ` : ""}
    `;
  }

  function yesNo(value) {
    return value ? "Yes" : "No";
  }

  function reviewItems() {
    return [
      ["Display Type", "Simple Display"],
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
        <p class="session-note" role="status">Generating display configuration&hellip; Please keep this page open.</p>
      ` : ""}
    `;
  }

  function renderUnsupported() {
    cancelConfiguration();
  }

  function renderGenerationError() {
    const target = state.display_type === "complex" ? "display package" : "config.ini";

    content.innerHTML = `
      <div class="success-panel" role="alert">
        <div class="success-icon" aria-hidden="true">!</div>
        <p class="eyebrow">Generation failed</p>
        <h2 id="step-title">The ${target} could not be generated</h2>
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
    const isComplex = state.display_type === "complex";
    const filename = isComplex
      ? `${state.project_id.trim().toUpperCase()}_L2.zip`
      : "config.ini";

    content.innerHTML = `
      <div class="success-panel">
        <div class="success-icon" aria-hidden="true">&#10003;</div>
        <p class="eyebrow">Configuration complete</p>
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
    const common = {
      project_id: state.project_id.trim().toUpperCase(),
      load_kg: Number(state.load_kg),
      load_persons: Number(state.load_persons),
      stops: Number(state.stops),
      direction_arrows: state.direction_arrows,
      lift_in_service: state.lift_in_service,
      fireman_mode: state.fireman_mode,
      stop_indicator: state.stop_indicator,
      overload_indicator: state.overload_indicator
    };

    if (state.display_type === "complex") {
      return {
        ...common,
        photo_indicator: state.photo_indicator,
        blocked_door_indicator: state.door_obstacle_indicator,
        show_car_speed: state.show_car_speed,
        ...(state.show_car_speed ? { nominal_speed: Number(state.nominal_speed) } : {}),
        time_color: state.time_color,
        real_speed_color: state.real_speed_color,
        cabin_load_color: state.cabin_load_color,
        lift_id_color: state.lift_id_color,
        speed_message_color: state.speed_message_color,
        nominal_speed_color: state.nominal_speed_color,
        lift_indicators_color: state.lift_indicators_color,
        floor_indicator_color: state.floor_indicator_color
      };
    }

    return {
      ...common,
      door_obstacle_indicator: state.door_obstacle_indicator,
      real_time_clock: state.real_time_clock
    };
  }

  function payloadIsComplete(payload) {
    const commonValid = (
      isValidProjectId(payload.project_id) &&
      Number.isInteger(payload.load_kg) &&
      payload.load_kg >= 0 &&
      payload.load_kg <= 9999 &&
      Number.isInteger(payload.load_persons) &&
      payload.load_persons >= 0 &&
      payload.load_persons <= 99 &&
      Number.isInteger(payload.stops) &&
      typeof payload.direction_arrows === "boolean" &&
      typeof payload.lift_in_service === "boolean" &&
      typeof payload.fireman_mode === "boolean" &&
      typeof payload.stop_indicator === "boolean" &&
      typeof payload.overload_indicator === "boolean"
    );

    if (!commonValid) {
      return false;
    }

    if (state.display_type === "complex") {
      const validColor = (value) => /^#[0-9A-F]{6}$/i.test(String(value));
      return (
        payload.stops >= 2 &&
        payload.stops <= 99 &&
        typeof payload.photo_indicator === "boolean" &&
        typeof payload.blocked_door_indicator === "boolean" &&
        typeof payload.show_car_speed === "boolean" &&
        (!payload.show_car_speed || isValidNominalSpeed(payload.nominal_speed)) &&
        validColor(payload.time_color) &&
        validColor(payload.real_speed_color) &&
        validColor(payload.cabin_load_color) &&
        validColor(payload.lift_id_color) &&
        validColor(payload.speed_message_color) &&
        validColor(payload.nominal_speed_color) &&
        validColor(payload.lift_indicators_color) &&
        validColor(payload.floor_indicator_color)
      );
    }

    return (
      payload.stops >= 1 &&
      payload.stops <= 99 &&
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
      currentStep = state.display_type === "complex" ? "preview" : "review";
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

    const isComplex = state.display_type === "complex";
    const endpoint = isComplex ? API_ENDPOINTS.complex : API_ENDPOINTS.simple;
    const filename = isComplex
      ? `${payload.project_id}_L2.zip`
      : "config.ini";

    isGenerating = true;
    generationError = "";
    render();

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/octet-stream, application/zip, application/json",
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
            { label: "Simple Display", value: "simple" },
            { label: "Default Display", value: "complex" }
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

      case "photo-indicator":
        renderChoiceStep({
          key: "photo_indicator",
          title: "Photo Indicator",
          description: "Enable the photo indicator?",
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

      case "show-car-speed":
        renderChoiceStep({
          key: "show_car_speed",
          title: "Show Car Speed",
          description: "Show live car speed from the CAN bus together with the nominal car speed?",
          type: "boolean",
          options: [
            { label: "Yes", value: true },
            { label: "No", value: false }
          ]
        });
        break;

      case "nominal-speed":
        renderNominalSpeed();
        break;

      case "display-colors":
        renderDisplayColors();
        break;

      case "preview":
        renderPreview();
        break;

      case "review":
        renderReview();
        break;

      case "unsupported":
        renderUnsupported();
        return;

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
    const preview = content.querySelector('[data-action="preview"]');
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

    if (preview) {
      preview.addEventListener("click", () => goNext());
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
