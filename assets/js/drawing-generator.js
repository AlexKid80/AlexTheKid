(function () {
  "use strict";

  // Live Flask backend hosted on Render.
  const API_ENDPOINT = "https://elevatorsbackend.onrender.com/generate";

  const initialState = () => ({
    operator: "",
    family: null,
    en8120: null,
    contactors: null,
    doors: null,
    side_b_lops: false,
    frame: null,
    intercom: null,
    gsm: false,
    stops: null,
    vip: null
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

  function isSupportedFamily() {
    return state.family === "traction" && state.en8120 === true;
  }


  function clearMRL8120Selections() {
    state.contactors = null;
    state.doors = null;
    state.side_b_lops = false;
    state.frame = null;
    state.intercom = null;
    state.gsm = false;
    state.stops = null;
    state.vip = null;
  }


  function getFlow() {
    const flow = ["operator", "family", "en8120"];

    if (isSupportedFamily() || state.en8120 === null) {
      flow.push("contactors", "doors");

      if (state.doors === 2) {
        flow.push("side_b_lops");
      }

      flow.push("frame", "intercom");

      if (state.intercom === true) {
        flow.push("gsm");
      }

      flow.push("stops", "vip", "review");
    }

    return flow;
  }


  function nextStepFrom(stepId) {
    if (stepId === "en8120" && !isSupportedFamily()) {
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
          clearMRL8120Selections();
        }


        // Unsupported standards/families must not retain
        // MRL8120-specific selections.
        if (
          config.key === "en8120" &&
          !isSupportedFamily()
        ) {
          clearMRL8120Selections();
        }


        // Side B only applies to two-door elevators.
        if (config.key === "doors") {
          if (value === 1) {
            state.side_b_lops = false;
          } else if (previousValue !== 2) {
            state.side_b_lops = null;
          }
        }


        // GSM only applies when Intercom is enabled.
        if (config.key === "intercom") {
          if (value === false) {
            state.gsm = false;
          } else if (previousValue !== true) {
            state.gsm = null;
          }
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
          This is saved in the current configuration
          but is not sent to the drawing engine yet.
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
  // REVIEW
  // ============================================================

  function yesNo(value) {
    return value ? "Yes" : "No";
  }


  function reviewItems() {
    const items = [
      ["Prepared by", state.operator],
      ["Family", "Traction"],
      ["Standard", "EN 81.20"],
      ["Contactors", state.contactors],
      ["Doors", String(state.doors)]
    ];


    if (state.doors === 2) {
      items.push([
        "Side B LOPs",
        yesNo(state.side_b_lops)
      ]);
    }


    items.push([
      "Installation frame",
      state.frame
    ]);


    items.push([
      "Intercom",
      yesNo(state.intercom)
    ]);


    if (state.intercom === true) {
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


  function renderReview() {
    const items = reviewItems();


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
            ? "Generating drawing..."
            : "Generate Drawing"
          }
        </button>

      </div>


      ${isGenerating
        ? `
          <p
            class="session-note"
            role="status"
          >
            Generating drawing&hellip;
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
          Traction with EN 81.20 is available now.
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

  function buildEnginePayload() {
    return {
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


  function payloadIsComplete(payload) {
    return (
      isSupportedFamily() &&

      ["AC", "DC"].includes(
        payload.contactors
      ) &&

      [1, 2].includes(
        payload.doors
      ) &&

      typeof payload.side_b_lops === "boolean" &&

      !(
        payload.doors === 1 &&
        payload.side_b_lops
      ) &&

      ["C", "L"].includes(
        payload.frame
      ) &&

      typeof payload.intercom === "boolean" &&

      typeof payload.gsm === "boolean" &&

      !(
        !payload.intercom &&
        payload.gsm
      ) &&

      Number.isInteger(
        payload.stops
      ) &&

      payload.stops >= 2 &&
      payload.stops <= 8 &&

      typeof payload.vip === "boolean"
    );
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

  function downloadPdf(blob) {
    const downloadUrl =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = downloadUrl;

    link.download =
      "MRL8120_drawing.pdf";

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
      buildEnginePayload();


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
        await fetch(API_ENDPOINT, {
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


      downloadPdf(pdfBlob);

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


      case "review":

        if (!isSupportedFamily()) {
          goTo(
            "unsupported",
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