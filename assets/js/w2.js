(function () {
  "use strict";

  const API_ENDPOINTS = Object.freeze({
    languages: "https://elevatorsbackend.onrender.com/w2-languages",
    generate: "https://elevatorsbackend.onrender.com/generate-w2"
  });

  const ACCESS_SESSION = Object.freeze({
    tokenKey: "axl_lifts_token",
    expiresKey: "axl_lifts_token_expires",
    loginPage: "elogin.html"
  });

  const initialState = () => ({
    language: "",
    lowest_floor: "",
    highest_floor: "",
    stops: [],
    door_announcements: null,
    door_b_announcements: null,
    fireman: null,
    overload: null,
    out_of_service: null,
    range_signature: ""
  });

  let state = initialState();
  let languages = [];
  let languagesLoading = false;
  let languagesError = "";
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

  function selectedLanguage() {
    return languages.find((item) => item.code === state.language) || null;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function floorLabel(value) {
    if (value === "MEZ") {
      return "MEZ";
    }

    const number = Number(value);

    if (number === 0) {
      return "Ground (0)";
    }

    return String(number);
  }

  function getFlow() {
    const flow = ["language", "lowest-floor", "highest-floor", "stops-editor"];
    const language = selectedLanguage();

    if (!language) {
      return flow;
    }

    if (language.supports_door_announcements) {
      flow.push("door-announcements");

      if (state.door_announcements === true) {
        flow.push("door-b-announcements");
      }
    }

    if (language.supports_fireman) {
      flow.push("fireman");
    }

    if (language.supports_overload) {
      flow.push("overload");
    }

    if (language.supports_out_of_service) {
      flow.push("out-of-service");
    }

    flow.push("review");
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
    const hidden = ["landing", "success", "generation-error"];
    const show = !hidden.includes(currentStep);

    progressRegion.hidden = !show;

    if (!show) {
      return;
    }

    const flow = getFlow();
    const index = Math.max(flow.indexOf(currentStep), 0);
    const percent = Math.round(((index + 1) / flow.length) * 100);

    progressLabel.textContent = `Step ${index + 1} of ${flow.length}`;
    progressPercent.textContent = `${percent}%`;
    progressBar.style.width = `${percent}%`;
    progressTrack.setAttribute("aria-valuenow", String(percent));
  }

  function navigationMarkup() {
    return `
      <div class="step-navigation">
        <button class="text-button" type="button" data-action="back">&larr; Back</button>
        <button class="text-button cancel" type="button" data-action="cancel">Cancel</button>
      </div>
    `;
  }

  function renderLanding() {
    content.innerHTML = `
      <div class="voice-landing">
        <div>
          <p class="eyebrow">MLC voice package builder</p>
          <h1 id="step-title">W2 / L2 Voice Announcer</h1>
          <p class="landing-copy">
            Choose the language, define the served stops and select the required announcements.
            The generator builds the final renamed WAV package automatically.
          </p>
          <button class="primary-button" type="button" data-action="start">Start</button>
        </div>

        <div class="voice-wave" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span>
        </div>
      </div>
    `;
  }

  function capabilityChips(language) {
    const chips = [];

    if (language.supports_door_announcements) chips.push("Doors A/B");
    if (language.supports_fireman) chips.push("Fireman");
    if (language.supports_overload) chips.push("Overload");
    if (language.supports_out_of_service) chips.push("Out of service");
    if (language.supports_mezzanine) chips.push("Mezzanine");

    return chips
      .map((label) => `<span class="capability-chip">${escapeHtml(label)}</span>`)
      .join("");
  }

  function renderLanguage() {
    if (languagesLoading) {
      content.innerHTML = `
        <div class="step-header">
          <p class="eyebrow">Voice library</p>
          <h2 id="step-title">Loading Languages</h2>
          <p class="step-intro">Reading the available voice libraries from the protected backend.</p>
        </div>

        <div class="loading-panel">
          <strong>Connecting to W2 voice library...</strong>
          Please wait for the server response.
        </div>

        ${navigationMarkup()}
      `;
      return;
    }

    if (languagesError) {
      content.innerHTML = `
        <div class="step-header">
          <p class="eyebrow">Voice library</p>
          <h2 id="step-title">Languages Unavailable</h2>
          <p class="step-intro">${escapeHtml(languagesError)}</p>
        </div>

        <div class="loading-panel">
          <strong>Could not load the language database.</strong>
          <button class="primary-button" type="button" data-action="retry-languages">Retry</button>
        </div>

        ${navigationMarkup()}
      `;
      return;
    }

    content.innerHTML = `
      <div class="step-header">
        <p class="eyebrow">Voice library</p>
        <h2 id="step-title">Select Language</h2>
        <p class="step-intro">
          Only functions available in the selected language will appear in the wizard.
        </p>
      </div>

      <div class="language-grid">
        ${languages.map((language) => `
          <button class="language-card" type="button" data-language="${escapeHtml(language.code)}">
            <span>
              <span class="language-code">${escapeHtml(language.code.toUpperCase())}</span>
              <span class="language-name">${escapeHtml(language.name)}</span>
              <span class="language-range">Floors ${language.min_floor} to ${language.max_floor}</span>
            </span>
            <span class="capability-strip">${capabilityChips(language)}</span>
          </button>
        `).join("")}
      </div>

      ${navigationMarkup()}
    `;

    content.querySelectorAll("[data-language]").forEach((button) => {
      button.addEventListener("click", () => {
        const code = button.dataset.language;

        if (state.language !== code) {
          state = {
            ...initialState(),
            language: code
          };
        }

        goNext();
      });
    });
  }

  function renderFloorInput(kind) {
    const language = selectedLanguage();
    const isLowest = kind === "lowest";
    const key = isLowest ? "lowest_floor" : "highest_floor";
    const title = isLowest ? "Lowest Served Floor" : "Highest Served Floor";
    const intro = isLowest
      ? "Choose the lowest floor served by this lift."
      : "Choose the highest floor served by this lift. The normal sequence will be built automatically.";
    const other = isLowest ? state.highest_floor : state.lowest_floor;

    content.innerHTML = `
      <div class="step-header">
        <p class="eyebrow">${escapeHtml(language.name)} voice map</p>
        <h2 id="step-title">${title}</h2>
        <p class="step-intro">${intro}</p>
      </div>

      <form class="range-form" id="floor-range-form">
        <label class="field-label" for="floor-value">${isLowest ? "Lowest floor" : "Highest floor"}</label>
        <input
          class="text-input"
          id="floor-value"
          type="number"
          inputmode="numeric"
          min="${language.min_floor}"
          max="${language.max_floor}"
          step="1"
          value="${escapeHtml(state[key])}"
          placeholder="${isLowest ? language.min_floor : language.max_floor}"
          required
        >
        <p class="field-help">
          Available range for ${escapeHtml(language.name)}: ${language.min_floor} to ${language.max_floor}.
        </p>
        <p class="field-error" id="floor-value-error" aria-live="polite"></p>

        ${other !== "" ? `
          <div class="range-summary">
            ${isLowest ? "Current highest" : "Current lowest"}:
            <strong>${escapeHtml(floorLabel(other))}</strong>
          </div>
        ` : ""}

        <div class="form-submit">
          <button class="primary-button" id="floor-continue" type="submit" disabled>Continue</button>
        </div>
      </form>

      ${navigationMarkup()}
    `;

    const form = document.getElementById("floor-range-form");
    const input = document.getElementById("floor-value");
    const error = document.getElementById("floor-value-error");
    const continueButton = document.getElementById("floor-continue");

    function validate(showRequired = false) {
      const raw = input.value.trim();
      const value = Number(raw);
      let message = "";

      if (!raw) {
        if (showRequired) {
          message = "Floor value is required.";
        }
      } else if (!Number.isInteger(value)) {
        message = "Use a whole floor number.";
      } else if (value < language.min_floor || value > language.max_floor) {
        message = `Use a floor from ${language.min_floor} to ${language.max_floor}.`;
      } else if (!isLowest && state.lowest_floor !== "" && value < Number(state.lowest_floor)) {
        message = "Highest floor cannot be below the lowest floor.";
      } else if (isLowest && state.highest_floor !== "" && value > Number(state.highest_floor)) {
        message = "Lowest floor cannot be above the highest floor.";
      }

      error.textContent = message;
      input.setAttribute("aria-invalid", String(Boolean(message)));
      continueButton.disabled = Boolean(message) || !raw;
      return !message && Boolean(raw);
    }

    input.addEventListener("input", () => {
      state[key] = input.value;
      validate();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!validate(true)) {
        input.focus();
        return;
      }

      state[key] = String(Number(input.value));

      if (!isLowest) {
        ensureDefaultStops();
      }

      goNext();
    });

    validate();
    window.setTimeout(() => input.focus(), 0);
  }

  function currentRangeSignature() {
    return `${state.language}:${state.lowest_floor}:${state.highest_floor}`;
  }

  function buildDefaultStops() {
    const low = Number(state.lowest_floor);
    const high = Number(state.highest_floor);
    const stops = [];

    for (let floor = low; floor <= high; floor += 1) {
      stops.push({
        floor,
        side: "A"
      });
    }

    return stops;
  }

  function ensureDefaultStops(force = false) {
    const signature = currentRangeSignature();

    if (force || !state.stops.length || state.range_signature !== signature) {
      state.stops = buildDefaultStops();
      state.range_signature = signature;
    }
  }

  function insertMezzanine(afterIndex) {
    state.stops.splice(afterIndex + 1, 0, {
      floor: "MEZ",
      side: "A"
    });

    render();
  }

  function setStopSide(index, side) {
    state.stops[index].side = side;
    render();
  }

  function removeStop(index) {
    if (state.stops.length <= 1) {
      return;
    }

    state.stops.splice(index, 1);
    render();
  }

  function renderStopsEditor() {
    const language = selectedLanguage();
    ensureDefaultStops();

    content.innerHTML = `
      <div class="step-header">
        <p class="eyebrow">Served stop sequence</p>
        <h2 id="step-title">Check &amp; Edit Stops</h2>
        <p class="step-intro">
          Side A is selected by default. Remove skipped floors, change A/B/Both, or insert mezzanine stops where required.
        </p>
      </div>

      <div class="stop-editor">
        <div class="stop-toolbar">
          <span class="stop-toolbar-copy">
            Lowest ${escapeHtml(floorLabel(state.lowest_floor))} &middot;
            Highest ${escapeHtml(floorLabel(state.highest_floor))}
          </span>

          <span class="stop-toolbar-actions">
            <button class="mini-button" type="button" data-action="reset-stops">Reset Range</button>
          </span>
        </div>

        <div class="stop-list">
          ${state.stops.map((stop, index) => `
            <div class="stop-row">
              <span class="stop-position">
                <small>Stop</small>
                <strong>${String(index + 1).padStart(2, "0")}</strong>
              </span>

              <span class="stop-floor">
                ${escapeHtml(floorLabel(stop.floor))}
                <small>${stop.floor === "MEZ" ? "Mezzanine audio" : "Floor announcement"}</small>
              </span>

              <span class="side-toggle" aria-label="Announcement side for stop ${index + 1}">
                ${["A", "B", "BOTH"].map((side) => `
                  <button
                    class="side-button${stop.side === side ? " is-active" : ""}"
                    type="button"
                    data-stop-side="${side}"
                    data-stop-index="${index}"
                  >${side === "BOTH" ? "A+B" : side}</button>
                `).join("")}
              </span>

              <button
                class="remove-stop"
                type="button"
                data-remove-stop="${index}"
                aria-label="Remove stop ${index + 1}"
                ${state.stops.length <= 1 ? "disabled" : ""}
              >&times;</button>
            </div>

            ${language.supports_mezzanine ? `
              <div class="mez-insert-row">
                <button class="mez-insert" type="button" data-add-mez-after="${index}">
                  + Add MEZ after stop ${String(index + 1).padStart(2, "0")}
                </button>
              </div>
            ` : ""}
          `).join("")}
        </div>

        <div class="stop-count">
          Final served stops: <strong>${state.stops.length}</strong>
        </div>

        <div class="final-actions">
          <button class="primary-button" type="button" data-action="continue-stops">Continue</button>
        </div>
      </div>

      ${navigationMarkup()}
    `;

    content.querySelectorAll("[data-stop-side]").forEach((button) => {
      button.addEventListener("click", () => {
        setStopSide(
          Number(button.dataset.stopIndex),
          button.dataset.stopSide
        );
      });
    });

    content.querySelectorAll("[data-remove-stop]").forEach((button) => {
      button.addEventListener("click", () => {
        removeStop(Number(button.dataset.removeStop));
      });
    });

    content.querySelectorAll("[data-add-mez-after]").forEach((button) => {
      button.addEventListener("click", () => {
        insertMezzanine(Number(button.dataset.addMezAfter));
      });
    });
  }

  function renderChoiceStep(config) {
    content.innerHTML = `
      <div class="step-header">
        <p class="eyebrow">${escapeHtml(config.eyebrow || "Voice package options")}</p>
        <h2 id="step-title">${escapeHtml(config.title)}</h2>
        <p class="step-intro">${escapeHtml(config.description)}</p>
      </div>

      <div class="choice-grid">
        <button class="choice-button${state[config.key] === true ? " is-selected" : ""}" type="button" data-choice="true">
          Yes
        </button>
        <button class="choice-button${state[config.key] === false ? " is-selected" : ""}" type="button" data-choice="false">
          No
        </button>
      </div>

      ${config.note ? `<p class="feature-note">${escapeHtml(config.note)}</p>` : ""}
      ${navigationMarkup()}
    `;

    content.querySelectorAll("[data-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        state[config.key] = button.dataset.choice === "true";

        if (config.key === "door_announcements" && state.door_announcements === false) {
          state.door_b_announcements = false;
        }

        goNext();
      });
    });
  }

  function yesNo(value) {
    return value === true ? "Yes" : "No";
  }

  function reviewItem(label, value) {
    return `
      <div class="review-item">
        <span class="review-label">${escapeHtml(label)}</span>
        <strong class="review-value">${escapeHtml(value)}</strong>
      </div>
    `;
  }

  function renderReview() {
    const language = selectedLanguage();
    const features = [];

    if (language.supports_door_announcements) {
      features.push(["Door announcements", yesNo(state.door_announcements)]);

      if (state.door_announcements === true) {
        features.push(["Door B states", yesNo(state.door_b_announcements)]);
      }
    }

    if (language.supports_fireman) {
      features.push(["Fireman", yesNo(state.fireman)]);
    }

    if (language.supports_overload) {
      features.push(["Overload", yesNo(state.overload)]);
    }

    if (language.supports_out_of_service) {
      features.push(["Out of service", yesNo(state.out_of_service)]);
    }

    content.innerHTML = `
      <div class="step-header">
        <p class="eyebrow">Final check</p>
        <h2 id="step-title">Review Voice Package</h2>
        <p class="step-intro">
          Confirm the served-stop sequence and available announcement functions before generating the ZIP.
        </p>
      </div>

      <div class="review-list">
        ${reviewItem("Language", language.name)}
        ${reviewItem("Language code", language.code.toUpperCase())}
        ${reviewItem("Served stops", String(state.stops.length))}
        ${reviewItem("Output", `W2_${language.code.toUpperCase()}.zip`)}
        ${features.map(([label, value]) => reviewItem(label, value)).join("")}
      </div>

      <div class="stop-review">
        <h3 class="stop-review-title">Stop Mapping</h3>
        <div class="stop-review-grid">
          ${state.stops.map((stop, index) => `
            <span class="stop-review-chip">
              ${String(index + 1).padStart(2, "0")}
              &rarr;
              <strong>${escapeHtml(floorLabel(stop.floor))}</strong>
              / ${escapeHtml(stop.side === "BOTH" ? "A+B" : stop.side)}
            </span>
          `).join("")}
        </div>
      </div>

      <div class="final-actions">
        <button class="primary-button" type="button" data-action="generate">
          ${isGenerating ? "Generating..." : "Generate Voice ZIP"}
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
        <h2 id="step-title">The voice package could not be generated</h2>
        <p class="step-intro">${escapeHtml(generationError || "The server did not complete the request.")}</p>

        <div class="success-actions">
          <button class="primary-button" type="button" data-action="retry-generation">Retry</button>
          <button class="secondary-button" type="button" data-action="back">&larr; Back</button>
          <button class="text-button cancel" type="button" data-action="cancel">Cancel</button>
        </div>
      </div>
    `;
  }

  function renderSuccess() {
    const language = selectedLanguage();
    const filename = `W2_${language.code.toUpperCase()}.zip`;

    content.innerHTML = `
      <div class="success-panel">
        <div class="success-icon" aria-hidden="true">&#10003;</div>
        <p class="eyebrow">Voice package complete</p>
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
    const language = selectedLanguage();

    return {
      language: state.language,
      stops: state.stops.map((stop) => ({
        floor: stop.floor,
        side: stop.side
      })),
      door_announcements: language.supports_door_announcements
        ? state.door_announcements === true
        : false,
      door_b_announcements:
        language.supports_door_announcements &&
        state.door_announcements === true
          ? state.door_b_announcements === true
          : false,
      fireman: language.supports_fireman
        ? state.fireman === true
        : false,
      overload: language.supports_overload
        ? state.overload === true
        : false,
      out_of_service: language.supports_out_of_service
        ? state.out_of_service === true
        : false
    };
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
      const text = (await response.text()).trim();

      if (text) {
        return text;
      }
    } catch (error) {
    }

    return `The server returned an error (${response.status}).`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.hidden = true;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  async function loadLanguages() {
    if (languagesLoading) {
      return;
    }

    const token = getAccessToken();

    if (!token) {
      clearAccessAndRedirect();
      return;
    }

    languagesLoading = true;
    languagesError = "";

    if (currentStep === "language") {
      render();
    }

    try {
      const response = await fetch(API_ENDPOINTS.languages, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${token}`
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

      if (!data || !Array.isArray(data.languages)) {
        throw new Error("The server returned an invalid language list.");
      }

      languages = data.languages;
      languagesLoading = false;
      languagesError = "";

      if (currentStep === "language") {
        render();
      }
    } catch (error) {
      languagesLoading = false;
      languagesError = error instanceof Error
        ? error.message
        : "Could not load the language database.";

      if (error instanceof TypeError) {
        languagesError = "Could not reach the W2 server. Please try again.";
      }

      if (currentStep === "language") {
        render();
      }
    }
  }

  async function generatePackage() {
    if (isGenerating) {
      return;
    }

    const token = getAccessToken();

    if (!token) {
      clearAccessAndRedirect();
      return;
    }

    const payload = buildPayload();
    const filename = `W2_${state.language.toUpperCase()}.zip`;

    isGenerating = true;
    generationError = "";
    render();

    try {
      const response = await fetch(API_ENDPOINTS.generate, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/zip, application/octet-stream, application/json",
          "Authorization": `Bearer ${token}`
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

      const blob = await response.blob();

      if (blob.size === 0) {
        throw new Error("The server returned an empty ZIP file.");
      }

      downloadBlob(blob, filename);
      isGenerating = false;
      goTo("success");
    } catch (error) {
      isGenerating = false;
      generationError = error instanceof Error
        ? error.message
        : "The W2 generation request failed.";

      if (error instanceof TypeError) {
        generationError = "Could not reach the W2 generation server. Please try again.";
      }

      goTo("generation-error");
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

      case "language":
        renderLanguage();
        break;

      case "lowest-floor":
        renderFloorInput("lowest");
        break;

      case "highest-floor":
        renderFloorInput("highest");
        break;

      case "stops-editor":
        renderStopsEditor();
        break;

      case "door-announcements":
        renderChoiceStep({
          key: "door_announcements",
          title: "Door State Announcements",
          description: "Announce Door A opening and closing?",
          note: "This option controls door movement messages only. Floor Side B is configured separately per stop."
        });
        break;

      case "door-b-announcements":
        renderChoiceStep({
          key: "door_b_announcements",
          title: "Door B State Announcements",
          description: "Also announce Door B opening and closing?",
          note: "This is independent from Side B floor announcements."
        });
        break;

      case "fireman":
        renderChoiceStep({
          key: "fireman",
          title: "Fireman Announcement",
          description: "Include the fireman-control voice announcement?"
        });
        break;

      case "overload":
        renderChoiceStep({
          key: "overload",
          title: "Overload Announcement",
          description: "Include the cabin-overload voice announcement?"
        });
        break;

      case "out-of-service":
        renderChoiceStep({
          key: "out_of_service",
          title: "Out of Service Announcement",
          description: "Include the lift-out-of-service voice announcement?"
        });
        break;

      case "review":
        renderReview();
        break;

      case "generation-error":
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
      goTo("language");
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

    if (action === "retry-languages") {
      loadLanguages();
      return;
    }

    if (action === "reset-stops") {
      ensureDefaultStops(true);
      render();
      return;
    }

    if (action === "continue-stops") {
      if (state.stops.length > 0) {
        goNext();
      }
      return;
    }

    if (action === "generate" || action === "retry-generation") {
      generatePackage();
      return;
    }

    if (action === "new") {
      cancelConfiguration();
    }
  });

  render();
  loadLanguages();
})();
