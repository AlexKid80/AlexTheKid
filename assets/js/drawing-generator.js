(function () {
  "use strict";

  // Live Flask backend endpoints hosted on Render.
  const API_ENDPOINTS = Object.freeze({
    en8120Technical: "https://elevatorsbackend.onrender.com/generate",
    en811Technical: "https://elevatorsbackend.onrender.com/generate-en811",
    tractionComplete: "https://elevatorsbackend.onrender.com/generate-traction-complete-test"
  });

  const initialLiftInfo = () => ({
    lift_id: "",
    additional_ens: "",
    motor_power_kw: "",
    motor_current_a: "",
    motor_rpm: "",
    pulley_diameter: "",
    car_speed: "",
    load_persons: "",
    load_kg: "",
    door_a_openings: [],
    door_b_openings: [],
    main_floor: "",
    button_colour: ""
  });

  const initialState = () => ({
    operator: "",
    family: null,
    en8120: null,
    machine: null,
    contactors: null,
    doors: null,
    side_b_lops: false,
    frame: null,
    intercom: null,
    gsm: false,
    stops: null,
    vip: null,
    lift_info: initialLiftInfo()
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


  // ============================================================
  // FAMILY / FLOW LOGIC
  // ============================================================

  function isEN8120() {
    return state.family === "traction" && state.en8120 === true;
  }


  function isEN811() {
    return state.family === "traction" && state.en8120 === false;
  }


  function isSupportedFamily() {
    return isEN8120() || isEN811();
  }


  function clearDrawingSelections() {
    state.machine = null;
    state.contactors = null;
    state.doors = null;
    state.side_b_lops = false;
    state.frame = null;
    state.intercom = null;
    state.gsm = false;
    state.stops = null;
    state.vip = null;
    sanitizeLiftInfo();
  }


  function clearMachineSelections() {
    state.contactors = null;
    state.doors = null;
    state.side_b_lops = false;
    state.frame = null;
    state.intercom = null;
    state.gsm = false;
    state.stops = null;
    state.vip = null;
    sanitizeLiftInfo();
  }


  function sanitizeFloorList(floors) {
    if (!Number.isInteger(state.stops)) {
      return [];
    }

    return [...new Set(floors)]
      .filter((floor) => (
        Number.isInteger(floor) &&
        floor >= 1 &&
        floor <= state.stops
      ))
      .sort((a, b) => a - b);
  }


  function sanitizeLiftInfo() {
    state.lift_info.door_a_openings =
      sanitizeFloorList(
        state.lift_info.door_a_openings
      );

    state.lift_info.door_b_openings =
      state.doors === 2
        ? sanitizeFloorList(
          state.lift_info.door_b_openings
        )
        : [];

    const mainFloor = Number(
      state.lift_info.main_floor
    );

    if (
      !Number.isInteger(state.stops) ||
      !Number.isInteger(mainFloor) ||
      mainFloor < 1 ||
      mainFloor > state.stops
    ) {
      state.lift_info.main_floor = "";
    } else {
      state.lift_info.main_floor = mainFloor;
    }
  }


  function getFlow() {
    const flow = ["operator", "family", "en8120"];

    // Preserve the existing EN81.20 flow exactly.
    if (isEN8120() || state.en8120 === null) {
      flow.push("contactors", "doors");

      if (state.doors === 2) {
        flow.push("side_b_lops");
      }

      flow.push("frame", "intercom");

      if (state.intercom === true) {
        flow.push("gsm");
      }

      flow.push(
        "stops",
        "vip",
        "lift-info",
        "review"
      );
    }

    // Traction EN81.1 starts by selecting its machine type.
    if (isEN811()) {
      flow.push("machine");

      if (["GEARED", "GEARLESS"].includes(state.machine)) {
        flow.push("doors");

        if (state.doors === 2) {
          flow.push("side_b_lops");
        }

        if (state.machine === "GEARLESS") {
          flow.push("frame");
        }

        flow.push("intercom");

        if (
          state.machine === "GEARLESS" &&
          state.intercom === true
        ) {
          flow.push("gsm");
        }

        flow.push(
          "stops",
          "vip",
          "lift-info",
          "review"
        );
      }
    }

    return flow;
  }


  function nextStepFrom(stepId) {
    if (
      stepId === "en8120" &&
      state.family !== "traction"
    ) {
      return "unsupported";
    }

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


  // ============================================================
  // PROGRESS
  // ============================================================

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

    progressTrack.setAttribute(
      "aria-valuenow",
      String(percent)
    );

    progressTrack.setAttribute(
      "aria-valuetext",
      `Step ${index + 1} of ${flow.length}`
    );
  }


  // ============================================================
  // COMMON MARKUP
  // ============================================================

  function navigationMarkup() {
    return `
      <div class="step-navigation">
        <button
          class="text-button"
          type="button"
          data-action="back"
        >
          &larr; Back
        </button>

        <button
          class="text-button cancel"
          type="button"
          data-action="cancel"
        >
          Cancel
        </button>
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
          >
            ${option.label}
          </button>
        `).join("")}
      </div>
    `;
  }


  // ============================================================
  // GENERIC CHOICE STEP
  // ============================================================

  function renderChoiceStep(config) {
    content.innerHTML = `
      <div class="step-header">
        <p class="eyebrow">
          ${config.eyebrow || "Drawing setup"}
        </p>

        <h2 id="step-title">
          ${config.title}
        </h2>

        ${config.description
          ? `<p class="step-intro">${config.description}</p>`
          : ""
        }
      </div>

      ${choiceMarkup(
        config.options,
        state[config.key],
        config.extraClass || ""
      )}

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


        // Changing family clears all family-specific answers.
        if (
          config.key === "family" &&
          previousValue !== value
        ) {
          state.en8120 = null;
          clearDrawingSelections();
        }


        // Switching standards clears every downstream answer so
        // fields from EN81.20 and EN81.1 can never leak across.
        if (
          config.key === "en8120" &&
          previousValue !== value
        ) {
          clearDrawingSelections();
        }


        // Switching Geared/Gearless clears their question answers,
        // including Gearless-only frame and GSM values.
        if (
          config.key === "machine" &&
          previousValue !== value
        ) {
          clearMachineSelections();
        }


        // Side B only applies to two-door elevators.
        if (config.key === "doors") {
          if (value === 1) {
            state.side_b_lops = false;
          } else if (previousValue !== 2) {
            state.side_b_lops = null;
          }

          sanitizeLiftInfo();
        }


        // GSM only applies when Intercom is enabled.
        if (config.key === "intercom") {
          if (
            value === false ||
            (isEN811() && state.machine === "GEARED")
          ) {
            state.gsm = false;
          } else if (previousValue !== true) {
            state.gsm = null;
          }
        }


        if (config.key === "stops") {
          sanitizeLiftInfo();
        }

        generationError = "";

        goNext();
      });
    });
  }


  // ============================================================
  // LANDING
  // ============================================================

  function renderLanding() {
    content.innerHTML = `
      <div class="landing-layout">

        <div>
          <p class="eyebrow">
            Elevator engineering
          </p>

          <h1 id="step-title">
            Drawing Generator
          </h1>

          <p class="landing-copy">
            Build and generate a clear elevator drawing
            through a short, guided setup.
          </p>

          <button
            class="primary-button"
            type="button"
            data-action="start"
          >
            Start
          </button>
        </div>


        <div
          class="landing-logo"
          aria-hidden="true"
        >
          <img
            src="assets/images/logo.png"
            alt=""
          >
        </div>

      </div>
    `;
  }


  // ============================================================
  // OPERATOR
  // ============================================================

  function renderOperator() {
    content.innerHTML = `
      <div class="step-header">

        <p class="eyebrow">
          Drawing setup
        </p>

        <h2 id="step-title">
          Operator / Prepared by
        </h2>

        <p class="step-intro">
          Enter the name of the person preparing this configuration.
        </p>

      </div>


      <form
        class="operator-form"
        id="operator-form"
      >

        <label
          class="field-label"
          for="operator-name"
        >
          Name
        </label>


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


        <p class="field-help">
          This name will appear on the generated drawing.
        </p>


        <div class="form-submit">
          <button
            class="primary-button"
            id="operator-continue"
            type="submit"
            ${state.operator.trim() ? "" : "disabled"}
          >
            Continue
          </button>
        </div>

      </form>

      ${navigationMarkup()}
    `;


    const form =
      document.getElementById("operator-form");

    const input =
      document.getElementById("operator-name");

    const continueButton =
      document.getElementById("operator-continue");


    input.addEventListener("input", () => {
      state.operator = input.value;

      continueButton.disabled =
        !input.value.trim();
    });


    form.addEventListener("submit", (event) => {
      event.preventDefault();

      state.operator =
        input.value.trim();

      if (state.operator) {
        goNext();
      }
    });


    window.setTimeout(
      () => input.focus(),
      0
    );
  }


  // ============================================================
  // LIFT INFORMATION
  // ============================================================

  function isValidLiftId(value) {
    return /^TQ\d{5}$/.test(
      String(value).trim().toUpperCase()
    );
  }


  function numberInputMarkup(config) {
    const value =
      state.lift_info[config.field];

    return `
      <div class="lift-field">
        <label
          class="field-label"
          for="${config.field}"
        >
          ${config.label}
          <span class="field-unit">
            ${config.unit}
          </span>
        </label>

        <input
          class="text-input"
          id="${config.field}"
          name="${config.field}"
          type="number"
          inputmode="decimal"
          min="${config.min || "0"}"
          ${config.max ? `max="${config.max}"` : ""}
          step="${config.step || "any"}"
          placeholder="Optional"
          value="${escapeHtml(value)}"
          data-lift-field="${config.field}"
        >

        ${config.errorId
          ? `<p class="field-error" id="${config.errorId}" aria-live="polite"></p>`
          : ""
        }
      </div>
    `;
  }


  function doorOpeningMarkup(
    title,
    field,
    floors
  ) {
    const selected =
      state.lift_info[field];

    return `
      <fieldset class="door-opening-group">
        <legend>${title}</legend>

        <div class="opening-grid">
          ${floors.map((floor) => `
            <label class="opening-option">
              <input
                type="checkbox"
                value="${floor}"
                data-opening-field="${field}"
                ${selected.includes(floor) ? "checked" : ""}
              >
              <span>${floor}</span>
            </label>
          `).join("")}
        </div>
      </fieldset>
    `;
  }


  function renderLiftInformation() {
    sanitizeLiftInfo();

    const liftInfo = state.lift_info;
    const floors = Array.from(
      { length: state.stops },
      (_, index) => index + 1
    );

    content.innerHTML = `
      <div class="step-header lift-info-header">
        <p class="eyebrow">
          Project details
        </p>

        <h2 id="step-title">
          Lift Information
        </h2>

        <p class="step-intro">
          Add the project information for the drawing cover pages.
          Only Lift ID is required.
        </p>
      </div>

      <form class="lift-info-form" id="lift-info-form">

        <fieldset class="lift-info-group">
          <legend>
            <span>1</span>
            Project / Identification
          </legend>

          <div class="lift-field-grid">
            <div class="lift-field">
              <label class="field-label" for="lift_id">
                Lift ID
                <span class="required-mark">Required</span>
              </label>

              <input
                class="text-input lift-id-input"
                id="lift_id"
                name="lift_id"
                type="text"
                inputmode="text"
                maxlength="7"
                autocomplete="off"
                spellcheck="false"
                placeholder="TQ34513"
                value="${escapeHtml(liftInfo.lift_id)}"
                aria-describedby="lift-id-help lift-id-error"
                data-lift-field="lift_id"
                required
              >

              <p class="field-help" id="lift-id-help">
                Format: TQ followed by exactly five digits.
              </p>

              <p
                class="field-error"
                id="lift-id-error"
                aria-live="polite"
              ></p>
            </div>

            <div class="lift-field readonly-field">
              <span class="field-label">
                Prepared by
              </span>

              <span class="readonly-value">
                ${escapeHtml(state.operator)}
              </span>

              <p class="field-help">
                Taken from the first wizard step.
              </p>
            </div>
          </div>
        </fieldset>


        <fieldset class="lift-info-group">
          <legend>
            <span>2</span>
            Additional Standards
          </legend>

          <div class="lift-field">
            <label class="field-label" for="additional_ens">
              Additional EN standards
              <span class="optional-mark">Optional</span>
            </label>

            <input
              class="text-input"
              id="additional_ens"
              name="additional_ens"
              type="text"
              maxlength="160"
              placeholder="EN81.50, EN81.70"
              value="${escapeHtml(liftInfo.additional_ens)}"
              data-lift-field="additional_ens"
            >

            <p class="field-help">
              Separate multiple standards with commas.
            </p>
          </div>
        </fieldset>


        <fieldset class="lift-info-group">
          <legend>
            <span>3</span>
            Drive / Motor
          </legend>

          <div class="lift-field-grid">
            ${numberInputMarkup({
              field: "motor_power_kw",
              label: "Motor Power P",
              unit: "kW"
            })}

            ${numberInputMarkup({
              field: "motor_current_a",
              label: "Motor Current I",
              unit: "A"
            })}

            ${numberInputMarkup({
              field: "motor_rpm",
              label: "Motor RPM",
              unit: "rpm"
            })}

            ${numberInputMarkup({
              field: "pulley_diameter",
              label: "Pulley Diameter PD",
              unit: "mm"
            })}
          </div>
        </fieldset>


        <fieldset class="lift-info-group">
          <legend>
            <span>4</span>
            Cabin Details
          </legend>

          <div class="lift-field-grid lift-field-grid-three">
            ${numberInputMarkup({
              field: "car_speed",
              label: "Car Speed",
              unit: "m/s",
              min: "0.0001",
              max: "1",
              errorId: "car-speed-error"
            })}

            ${numberInputMarkup({
              field: "load_persons",
              label: "Nominal Load",
              unit: "Persons",
              min: "1",
              step: "1"
            })}

            ${numberInputMarkup({
              field: "load_kg",
              label: "Nominal Load",
              unit: "kg"
            })}
          </div>
        </fieldset>


        <fieldset class="lift-info-group">
          <legend>
            <span>5</span>
            Door Openings
          </legend>

          <p class="group-help">
            Select any floors where each door opens.
            Door A and Door B are independent.
          </p>

          <div class="door-opening-columns">
            ${doorOpeningMarkup(
              "Door A opens at",
              "door_a_openings",
              floors
            )}

            ${state.doors === 2
              ? doorOpeningMarkup(
                "Door B opens at",
                "door_b_openings",
                floors
              )
              : ""
            }
          </div>
        </fieldset>


        <fieldset class="lift-info-group">
          <legend>
            <span>6</span>
            COP Details
          </legend>

          <div class="lift-field-grid">
            <div class="lift-field">
              <label class="field-label" for="main_floor">
                Main Floor
                <span class="optional-mark">Optional</span>
              </label>

              <select
                class="text-input"
                id="main_floor"
                name="main_floor"
                data-lift-field="main_floor"
              >
                <option value="">Not specified</option>
                ${floors.map((floor) => `
                  <option
                    value="${floor}"
                    ${Number(liftInfo.main_floor) === floor ? "selected" : ""}
                  >
                    ${floor}
                  </option>
                `).join("")}
              </select>
            </div>

            <div class="lift-field">
              <label class="field-label" for="button_colour">
                Cabin Button Colour
                <span class="optional-mark">Optional</span>
              </label>

              <select
                class="text-input"
                id="button_colour"
                name="button_colour"
                data-lift-field="button_colour"
              >
                <option value="">Not specified</option>
                ${["WHITE", "RED", "BLUE"].map((colour) => `
                  <option
                    value="${colour}"
                    ${liftInfo.button_colour === colour ? "selected" : ""}
                  >
                    ${colour.charAt(0) + colour.slice(1).toLowerCase()}
                  </option>
                `).join("")}
              </select>
            </div>
          </div>
        </fieldset>


        <div class="lift-info-actions">
          <button
            class="primary-button"
            id="lift-info-continue"
            type="submit"
            disabled
          >
            Continue to Review
          </button>
        </div>

        ${navigationMarkup()}
      </form>
    `;


    const form =
      document.getElementById("lift-info-form");

    const liftIdInput =
      document.getElementById("lift_id");

    const liftIdError =
      document.getElementById("lift-id-error");

    const carSpeedInput =
      document.getElementById("car_speed");

    const carSpeedError =
      document.getElementById("car-speed-error");

    const continueButton =
      document.getElementById("lift-info-continue");


    function validateLiftInfoForm(showRequired = false) {
      const validLiftId =
        isValidLiftId(liftIdInput.value);

      const hasLiftId =
        Boolean(liftIdInput.value.trim());

      if (!validLiftId && (hasLiftId || showRequired)) {
        liftIdError.textContent = hasLiftId
          ? "Use TQ followed by exactly five digits."
          : "Lift ID is required.";
      } else {
        liftIdError.textContent = "";
      }

      liftIdInput.setAttribute(
        "aria-invalid",
        String(!validLiftId && (hasLiftId || showRequired))
      );

      const speedText =
        carSpeedInput.value.trim();

      const speed = Number(speedText);

      const validSpeed = (
        speedText === "" ||
        (
          Number.isFinite(speed) &&
          speed > 0 &&
          speed <= 1
        )
      );

      carSpeedError.textContent = validSpeed
        ? ""
        : "Car speed must be greater than 0 and not exceed 1.0 m/s.";

      carSpeedInput.setAttribute(
        "aria-invalid",
        String(!validSpeed)
      );

      const valid = (
        validLiftId &&
        validSpeed &&
        form.checkValidity()
      );

      continueButton.disabled = !valid;

      return valid;
    }


    form.querySelectorAll("[data-lift-field]")
      .forEach((input) => {
        const updateValue = () => {
          const field = input.dataset.liftField;

          if (field === "lift_id") {
            input.value =
              input.value.toUpperCase();
          }

          if (field === "main_floor") {
            state.lift_info[field] =
              input.value === ""
                ? ""
                : Number(input.value);
          } else {
            state.lift_info[field] =
              input.value;
          }

          validateLiftInfoForm();
        };

        input.addEventListener("input", updateValue);
        input.addEventListener("change", updateValue);
      });


    form.querySelectorAll("[data-opening-field]")
      .forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
          const field =
            checkbox.dataset.openingField;

          const floor =
            Number(checkbox.value);

          const selected =
            new Set(state.lift_info[field]);

          if (checkbox.checked) {
            selected.add(floor);
          } else {
            selected.delete(floor);
          }

          state.lift_info[field] =
            [...selected].sort((a, b) => a - b);

          sanitizeLiftInfo();
        });
      });


    form.addEventListener("submit", (event) => {
      event.preventDefault();

      state.lift_info.lift_id =
        liftIdInput.value.trim().toUpperCase();

      sanitizeLiftInfo();

      if (!validateLiftInfoForm(true)) {
        const firstInvalid =
          form.querySelector('[aria-invalid="true"], :invalid');

        if (firstInvalid) {
          firstInvalid.focus();
        }

        return;
      }

      goNext();
    });


    validateLiftInfoForm();

    if (!liftInfo.lift_id) {
      window.setTimeout(
        () => liftIdInput.focus(),
        0
      );
    }
  }


  // ============================================================
  // REVIEW
  // ============================================================

  function yesNo(value) {
    return value ? "Yes" : "No";
  }


  function technicalReviewItems() {
    const items = [
      ["Family", "Traction"],
      ["Standard", isEN8120() ? "EN 81.20" : "EN 81.1"]
    ];


    if (isEN8120()) {
      items.push([
        "Contactors",
        state.contactors
      ]);
    }


    if (isEN811()) {
      items.push([
        "Machine",
        state.machine === "GEARED"
          ? "Geared"
          : "Gearless"
      ]);
    }


    items.push([
      "Doors",
      String(state.doors)
    ]);


    if (state.doors === 2) {
      items.push([
        "Side B LOPs",
        yesNo(state.side_b_lops)
      ]);
    }


    if (
      isEN8120() ||
      (isEN811() && state.machine === "GEARLESS")
    ) {
      items.push([
        "Installation frame",
        state.frame
      ]);
    }


    items.push([
      "Intercom",
      yesNo(state.intercom)
    ]);


    if (
      state.intercom === true &&
      (
        isEN8120() ||
        state.machine === "GEARLESS"
      )
    ) {
      items.push([
        "GSM",
        yesNo(state.gsm)
      ]);
    }


    items.push([
      "Stops",
      String(state.stops)
    ]);


    items.push([
      "VIP travel key",
      yesNo(state.vip)
    ]);


    return items;
  }


  function liftInfoReviewItems() {
    const liftInfo = state.lift_info;
    const items = [
      ["Prepared by", state.operator]
    ];

    const optionalValues = [
      [
        "Additional EN standards",
        liftInfo.additional_ens
      ],
      [
        "Motor Power P",
        liftInfo.motor_power_kw,
        "kW"
      ],
      [
        "Motor Current I",
        liftInfo.motor_current_a,
        "A"
      ],
      [
        "Motor RPM",
        liftInfo.motor_rpm,
        "rpm"
      ],
      [
        "Pulley Diameter PD",
        liftInfo.pulley_diameter,
        "mm"
      ],
      [
        "Car Speed",
        liftInfo.car_speed,
        "m/s"
      ],
      [
        "Nominal Load - Persons",
        liftInfo.load_persons,
        "Persons"
      ],
      [
        "Nominal Load - kg",
        liftInfo.load_kg,
        "kg"
      ]
    ];


    optionalValues.forEach(([
      label,
      value,
      unit = ""
    ]) => {
      if (String(value).trim() !== "") {
        items.push([
          label,
          unit ? `${value} ${unit}` : value
        ]);
      }
    });


    items.push([
      "Door A openings",
      liftInfo.door_a_openings.length
        ? liftInfo.door_a_openings.join(", ")
        : "None selected"
    ]);


    if (state.doors === 2) {
      items.push([
        "Door B openings",
        liftInfo.door_b_openings.length
          ? liftInfo.door_b_openings.join(", ")
          : "None selected"
      ]);
    }


    if (liftInfo.main_floor !== "") {
      items.push([
        "Main Floor",
        String(liftInfo.main_floor)
      ]);
    }


    if (liftInfo.button_colour) {
      items.push([
        "Cabin Button Colour",
        liftInfo.button_colour
      ]);
    }


    return items;
  }


  function reviewListMarkup(items) {
    return `
      <div class="review-list">
        ${items.map(([label, value]) => `
          <div class="review-item">
            <span class="review-label">
              ${label}
            </span>

            <span class="review-value">
              ${escapeHtml(value)}
            </span>
          </div>
        `).join("")}
      </div>
    `;
  }


  function renderReview() {
    const technicalItems =
      technicalReviewItems();

    const liftItems =
      liftInfoReviewItems();


    content.innerHTML = `
      <div class="step-header">

        <p class="eyebrow">
          Final check
        </p>

        <h2 id="step-title">
          Review configuration
        </h2>

        <p class="step-intro">
          Confirm the selections below
          before generating the drawing.
        </p>

      </div>


      <div class="review-section">
        <h3 class="review-section-title">
          Technical configuration
        </h3>

        ${reviewListMarkup(technicalItems)}
      </div>


      <div class="review-section">
        <div class="review-section-heading">
          <h3 class="review-section-title">
            Lift Information
          </h3>

          <span class="lift-id-chip">
            <small>Lift ID</small>
            ${escapeHtml(state.lift_info.lift_id)}
          </span>
        </div>

        ${reviewListMarkup(liftItems)}
      </div>


      <div
        class="final-actions"
        ${isGenerating ? 'aria-busy="true"' : ""}
      >

        <button
          class="secondary-button"
          type="button"
          data-action="back"
          ${isGenerating ? "disabled" : ""}
        >
          Back
        </button>


        <button
          class="text-button cancel"
          type="button"
          data-action="cancel"
          ${isGenerating ? "disabled" : ""}
        >
          Cancel
        </button>


        <button
          class="primary-button"
          type="button"
          data-action="generate"
          ${isGenerating ? "disabled" : ""}
        >
          ${isGenerating
            ? "Generating complete drawing..."
            : "Generate Complete Drawing"
          }
        </button>

      </div>


      ${isGenerating
        ? `
          <p
            class="session-note"
            role="status"
          >
            Generating complete drawing&hellip;
            Please keep this page open.
          </p>
        `
        : ""
      }
    `;
  }


  // ============================================================
  // UNSUPPORTED FAMILY
  // ============================================================

  function renderUnsupported() {
    content.innerHTML = `
      <div class="success-panel">

        <div
          class="success-icon"
          aria-hidden="true"
        >
          &middot;&middot;&middot;
        </div>


        <p class="eyebrow">
          Coming later
        </p>


        <h2 id="step-title">
          Drawing family not available yet
        </h2>


        <p class="step-intro">
          This drawing family is not available
          in the current version.
          Traction with EN 81.20 and EN 81.1
          are available now.
        </p>


        <div class="success-actions">

          <button
            class="secondary-button"
            type="button"
            data-action="back"
          >
            &larr; Back
          </button>


          <button
            class="text-button cancel"
            type="button"
            data-action="cancel"
          >
            Start Over
          </button>


          <a
            class="secondary-button"
            href="lifts.html"
          >
            Return to Main Site
          </a>

        </div>

      </div>
    `;
  }


  // ============================================================
  // GENERATION ERROR
  // ============================================================

  function renderGenerationError() {
    content.innerHTML = `
      <div
        class="success-panel"
        role="alert"
      >

        <div
          class="success-icon"
          aria-hidden="true"
        >
          !
        </div>


        <p class="eyebrow">
          Generation failed
        </p>


        <h2 id="step-title">
          The drawing could not be generated
        </h2>


        <p class="step-intro">
          ${escapeHtml(
            generationError ||
            "The server did not complete the request. Please try again."
          )}
        </p>


        <div class="success-actions">

          <button
            class="primary-button"
            type="button"
            data-action="retry"
          >
            Retry
          </button>


          <button
            class="secondary-button"
            type="button"
            data-action="back"
          >
            &larr; Back
          </button>


          <button
            class="text-button cancel"
            type="button"
            data-action="cancel"
          >
            Cancel
          </button>

        </div>

      </div>
    `;
  }


  // ============================================================
  // SUCCESS
  // ============================================================

  function renderSuccess() {
    content.innerHTML = `
      <div class="success-panel">

        <div
          class="success-icon"
          aria-hidden="true"
        >
          &#10003;
        </div>


        <p class="eyebrow">
          Drawing complete
        </p>


        <h2 id="step-title">
          Drawing generated successfully.
        </h2>


        <p class="step-intro">
          The PDF download has started.
        </p>


        <div class="success-actions">

          <button
            class="primary-button"
            type="button"
            data-action="new"
          >
            Start New Configuration
          </button>


          <a
            class="secondary-button"
            href="lifts.html"
          >
            Return to Main Site
          </a>

        </div>

      </div>
    `;
  }


  // ============================================================
  // BACKEND PAYLOAD
  // ============================================================

  function buildEN8120DrawingConfig() {
    return {
      standard: "EN81.20",

      document_title:
        "MRL EN81.20 ELECTRICAL DRAWING",

      contactors: state.contactors,

      doors: state.doors,

      side_b_lops:
        state.doors === 2
          ? state.side_b_lops
          : false,

      frame: state.frame,

      intercom: state.intercom,

      gsm:
        state.intercom === true
          ? state.gsm
          : false,

      stops: state.stops,

      vip: state.vip
    };
  }


  function buildEN811DrawingConfig() {
    if (state.machine === "GEARED") {
      return {
        standard: "EN81.1",

        document_title:
          "MR EN81.1 ELECTRICAL DRAWING",

        machine: "GEARED",

        doors: state.doors,

        side_b_lops:
          state.doors === 2
            ? state.side_b_lops
            : false,

        intercom: state.intercom,

        stops: state.stops,

        vip: state.vip
      };
    }


    return {
      standard: "EN81.1",

      document_title:
        "MRL EN81.1 ELECTRICAL DRAWING",

      machine: "GEARLESS",

      doors: state.doors,

      side_b_lops:
        state.doors === 2
          ? state.side_b_lops
          : false,

      frame: state.frame,

      intercom: state.intercom,

      gsm:
        state.intercom === true
          ? state.gsm
          : false,

      stops: state.stops,

      vip: state.vip
    };
  }


  function addOptionalNumber(
    target,
    field,
    value
  ) {
    if (String(value).trim() !== "") {
      target[field] = Number(value);
    }
  }


  function buildLiftInfoPayload() {
    sanitizeLiftInfo();

    const liftInfo = state.lift_info;

    const payload = {
      lift_id:
        liftInfo.lift_id.trim().toUpperCase(),

      prepared_by:
        state.operator.trim(),

      door_a_openings:
        [...liftInfo.door_a_openings],

      door_b_openings:
        state.doors === 2
          ? [...liftInfo.door_b_openings]
          : []
    };


    const additionalEns =
      liftInfo.additional_ens.trim();

    if (additionalEns) {
      payload.additional_ens =
        additionalEns;
    }


    [
      "motor_power_kw",
      "motor_current_a",
      "motor_rpm",
      "pulley_diameter",
      "car_speed",
      "load_persons",
      "load_kg"
    ].forEach((field) => {
      addOptionalNumber(
        payload,
        field,
        liftInfo[field]
      );
    });


    if (liftInfo.main_floor !== "") {
      payload.main_floor =
        Number(liftInfo.main_floor);
    }


    if (liftInfo.button_colour) {
      payload.button_colour =
        liftInfo.button_colour;
    }


    return payload;
  }


  function buildDrawingConfig() {
    return isEN8120()
      ? buildEN8120DrawingConfig()
      : buildEN811DrawingConfig();
  }


  function buildCompletePayload() {
    return {
      drawing_config:
        buildDrawingConfig(),

      lift_info:
        buildLiftInfoPayload()
    };
  }


  function en8120ConfigIsComplete(config) {
    return (
      isEN8120() &&

      config.standard === "EN81.20" &&

      config.document_title ===
        "MRL EN81.20 ELECTRICAL DRAWING" &&

      ["AC", "DC"].includes(
        config.contactors
      ) &&

      [1, 2].includes(
        config.doors
      ) &&

      typeof config.side_b_lops === "boolean" &&

      !(
        config.doors === 1 &&
        config.side_b_lops
      ) &&

      ["C", "L"].includes(
        config.frame
      ) &&

      typeof config.intercom === "boolean" &&

      typeof config.gsm === "boolean" &&

      !(
        !config.intercom &&
        config.gsm
      ) &&

      Number.isInteger(
        config.stops
      ) &&

      config.stops >= 2 &&
      config.stops <= 8 &&

      typeof config.vip === "boolean"
    );
  }


  function en811ConfigIsComplete(config) {
    const commonFieldsAreValid = (
      isEN811() &&

      config.standard === "EN81.1" &&

      ["GEARED", "GEARLESS"].includes(
        config.machine
      ) &&

      [1, 2].includes(
        config.doors
      ) &&

      typeof config.side_b_lops === "boolean" &&

      !(
        config.doors === 1 &&
        config.side_b_lops
      ) &&

      typeof config.intercom === "boolean" &&

      Number.isInteger(
        config.stops
      ) &&

      config.stops >= 2 &&
      config.stops <= 8 &&

      typeof config.vip === "boolean"
    );


    if (!commonFieldsAreValid) {
      return false;
    }


    if (config.machine === "GEARED") {
      return (
        config.document_title ===
          "MR EN81.1 ELECTRICAL DRAWING" &&

        !("contactors" in config) &&
        !("frame" in config) &&
        !("gsm" in config)
      );
    }


    return (
      config.document_title ===
        "MRL EN81.1 ELECTRICAL DRAWING" &&

      !("contactors" in config) &&

      ["C", "L"].includes(
        config.frame
      ) &&

      typeof config.gsm === "boolean" &&

      !(
        !config.intercom &&
        config.gsm
      )
    );
  }


  function floorListIsValid(floors) {
    return (
      Array.isArray(floors) &&
      floors.every((floor) => (
        Number.isInteger(floor) &&
        floor >= 1 &&
        floor <= state.stops
      ))
    );
  }


  function liftInfoPayloadIsComplete(liftInfo) {
    if (
      !liftInfo ||
      !isValidLiftId(liftInfo.lift_id) ||
      typeof liftInfo.prepared_by !== "string" ||
      !liftInfo.prepared_by.trim() ||
      !floorListIsValid(liftInfo.door_a_openings) ||
      !floorListIsValid(liftInfo.door_b_openings) ||
      (state.doors === 1 && liftInfo.door_b_openings.length)
    ) {
      return false;
    }


    if (
      "car_speed" in liftInfo &&
      (
        !Number.isFinite(liftInfo.car_speed) ||
        liftInfo.car_speed <= 0 ||
        liftInfo.car_speed > 1
      )
    ) {
      return false;
    }


    if (
      "main_floor" in liftInfo &&
      (
        !Number.isInteger(liftInfo.main_floor) ||
        liftInfo.main_floor < 1 ||
        liftInfo.main_floor > state.stops
      )
    ) {
      return false;
    }


    if (
      "button_colour" in liftInfo &&
      !["WHITE", "RED", "BLUE"].includes(
        liftInfo.button_colour
      )
    ) {
      return false;
    }


    return [
      "motor_power_kw",
      "motor_current_a",
      "motor_rpm",
      "pulley_diameter",
      "load_persons",
      "load_kg"
    ].every((field) => (
      !(field in liftInfo) ||
      Number.isFinite(liftInfo[field])
    ));
  }


  function payloadIsComplete(payload) {
    if (
      !payload ||
      !payload.drawing_config ||
      !payload.lift_info
    ) {
      return false;
    }


    const validDrawingConfig =
      isEN8120()
        ? en8120ConfigIsComplete(
          payload.drawing_config
        )
        : en811ConfigIsComplete(
          payload.drawing_config
        );


    return (
      validDrawingConfig &&
      liftInfoPayloadIsComplete(
        payload.lift_info
      )
    );
  }


  function getGenerationConfig() {
    const liftId =
      state.lift_info.lift_id
        .trim()
        .toUpperCase();


    return {
      endpoint:
        API_ENDPOINTS.tractionComplete,

      filename:
        `${liftId}.pdf`
    };
  }


  // ============================================================
  // SERVER ERROR HANDLING
  // ============================================================

  async function readServerError(response) {
    try {
      const data =
        await response.clone().json();

      if (
        data &&
        typeof data.error === "string" &&
        data.error.trim()
      ) {
        return data.error.trim();
      }

    } catch (error) {
      // Response was not JSON.
    }


    try {
      const message =
        (await response.text()).trim();

      if (message) {
        return message;
      }

    } catch (error) {
      // Use status fallback.
    }


    return `The server returned an error (${response.status}).`;
  }


  // ============================================================
  // PDF DOWNLOAD
  // ============================================================

  function downloadPdf(blob, filename) {
    const downloadUrl =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

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


  // ============================================================
  // GENERATE DRAWING
  // ============================================================

  async function generateDrawing() {
    if (isGenerating) {
      return;
    }


    if (currentStep === "generating-error") {
      if (
        history[history.length - 1] ===
        "generating-error"
      ) {
        history.pop();
      }

      currentStep = "review";
    }


    const payload =
      buildCompletePayload();


    const generationConfig =
      getGenerationConfig();


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

      const response =
        await fetch(generationConfig.endpoint, {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "Accept":
              "application/pdf, application/json"
          },

          body:
            JSON.stringify(payload)
        });


      if (!response.ok) {
        throw new Error(
          await readServerError(response)
        );
      }


      const pdfBlob =
        await response.blob();


      if (pdfBlob.size === 0) {
        throw new Error(
          "The server returned an empty PDF file."
        );
      }


      downloadPdf(
        pdfBlob,
        generationConfig.filename
      );

      isGenerating = false;

      goTo("success");


    } catch (error) {

      isGenerating = false;

      generationError =
        error instanceof Error
          ? error.message
          : "The drawing request failed.";


      if (error instanceof TypeError) {
        generationError =
          "Could not reach the drawing server. Please try again in a moment.";
      }


      goTo("generating-error");
    }
  }


  // ============================================================
  // MAIN RENDER
  // ============================================================

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

          title:
            "Hydraulic or Traction?",

          description:
            "Choose the elevator family for this drawing.",

          options: [
            {
              label: "Hydraulic",
              value: "hydraulic"
            },
            {
              label: "Traction",
              value: "traction"
            }
          ]
        });
        break;


      case "en8120":
        renderChoiceStep({
          key: "en8120",

          title:
            "EN 81.20?",

          description:
            "Select whether this drawing follows EN 81.20.",

          type: "boolean",

          options: [
            {
              label: "Yes",
              value: true
            },
            {
              label: "No",
              value: false
            }
          ]
        });
        break;


      case "machine":
        renderChoiceStep({
          key: "machine",

          title:
            "Geared or Gearless?",

          description:
            "Choose the traction machine type for this EN 81.1 drawing.",

          options: [
            {
              label: "Geared",
              value: "GEARED"
            },
            {
              label: "Gearless",
              value: "GEARLESS"
            }
          ]
        });
        break;


      case "contactors":
        renderChoiceStep({
          key: "contactors",

          title:
            "Contactors",

          description:
            "Choose the contactor control type for this traction elevator.",

          options: [
            {
              label: "AC",
              value: "AC"
            },
            {
              label: "DC",
              value: "DC"
            }
          ]
        });
        break;


      case "doors":
        renderChoiceStep({
          key: "doors",

          title:
            "Number of doors",

          description:
            "Select the number of elevator door sides.",

          type: "number",

          options: [
            {
              label: "1 Door",
              value: 1
            },
            {
              label: "2 Doors",
              value: 2
            }
          ]
        });
        break;


      case "side_b_lops":
        renderChoiceStep({
          key: "side_b_lops",

          title:
            "Side B LOPs?",

          description:
            "Choose whether landing operating panels are required on Side B.",

          type: "boolean",

          options: [
            {
              label: "Yes",
              value: true
            },
            {
              label: "No",
              value: false
            }
          ]
        });
        break;


      case "frame":
        renderChoiceStep({
          key: "frame",

          title:
            "Installation frame",

          description:
            "Choose the installation frame type.",

          options: [
            {
              label: "C",
              value: "C"
            },
            {
              label: "L",
              value: "L"
            }
          ]
        });
        break;


      case "intercom":
        renderChoiceStep({
          key: "intercom",

          title:
            "Intercom?",

          description:
            "Choose whether the drawing includes an intercom.",

          type: "boolean",

          options: [
            {
              label: "Yes",
              value: true
            },
            {
              label: "No",
              value: false
            }
          ]
        });
        break;


      case "gsm":
        renderChoiceStep({
          key: "gsm",

          title:
            "GSM?",

          description:
            "Choose whether GSM is required with the intercom.",

          type: "boolean",

          options: [
            {
              label: "Yes",
              value: true
            },
            {
              label: "No",
              value: false
            }
          ]
        });
        break;


      case "stops":
        renderChoiceStep({
          key: "stops",

          title:
            "Number of stops",

          description:
            "Select the total number of elevator stops.",

          type: "number",

          extraClass:
            "stops-grid",

          options:
            [2, 3, 4, 5, 6, 7, 8]
              .map((number) => ({
                label: String(number),
                value: number
              }))
        });
        break;


      case "vip":
        renderChoiceStep({
          key: "vip",

          title:
            "VIP travel key?",

          description:
            "Choose whether VIP travel key operation is required.",

          type: "boolean",

          options: [
            {
              label: "Yes",
              value: true
            },
            {
              label: "No",
              value: false
            }
          ]
        });
        break;


      case "lift-info":
        renderLiftInformation();
        break;


      case "review":

        if (!isSupportedFamily()) {
          goTo(
            "unsupported",
            false
          );

          return;
        }


        if (!isValidLiftId(
          state.lift_info.lift_id
        )) {
          goTo(
            "lift-info",
            false
          );

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


    const heading =
      document.getElementById("step-title");


    if (
      heading &&
      currentStep !== "operator"
    ) {
      heading.setAttribute(
        "tabindex",
        "-1"
      );

      heading.focus({
        preventScroll: true
      });
    }
  }


  // ============================================================
  // SHARED BUTTON ACTIONS
  // ============================================================

  function bindSharedActions() {
    const start =
      content.querySelector(
        '[data-action="start"]'
      );

    const back =
      content.querySelector(
        '[data-action="back"]'
      );

    const cancel =
      content.querySelector(
        '[data-action="cancel"]'
      );

    const generate =
      content.querySelector(
        '[data-action="generate"]'
      );

    const retry =
      content.querySelector(
        '[data-action="retry"]'
      );

    const startNew =
      content.querySelector(
        '[data-action="new"]'
      );


    if (start) {
      start.addEventListener(
        "click",
        () => goTo("operator")
      );
    }


    if (back) {
      back.addEventListener(
        "click",
        goBack
      );
    }


    if (cancel) {
      cancel.addEventListener(
        "click",
        cancelConfiguration
      );
    }


    if (generate) {
      generate.addEventListener(
        "click",
        generateDrawing
      );
    }


    if (retry) {
      retry.addEventListener(
        "click",
        generateDrawing
      );
    }


    if (startNew) {
      startNew.addEventListener(
        "click",
        cancelConfiguration
      );
    }
  }


  // ============================================================
  // HTML ESCAPING
  // ============================================================

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }


  // ============================================================
  // START APPLICATION
  // ============================================================

  render();

})();
