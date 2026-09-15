(function () {
  "use strict";

  var AUTH_ENDPOINT =
    "https://elevatorsbackend.onrender.com/auth/login";

  var TOKEN_KEY =
    "axl_lifts_token";

  var TOKEN_EXPIRES_KEY =
    "axl_lifts_token_expires";

  var redirectPage =
    "lifts.html";

  var form =
    document.getElementById("accessForm");

  var input =
    document.getElementById("pinInput");

  var status =
    document.getElementById("statusMessage");

  if (!form || !input || !status) {
    return;
  }

  var submitButton =
    form.querySelector('button[type="submit"]');

  function setStatus(message, type) {
    status.textContent = message;
    status.className = "status-message";

    if (type) {
      status.classList.add(type);
    }
  }

  function setBusy(isBusy) {
    if (submitButton) {
      submitButton.disabled = isBusy;
    }

    input.disabled = isBusy;
  }

  function clearOldAccessState() {
    sessionStorage.removeItem("axl_lifts_access");
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXPIRES_KEY);
  }

  clearOldAccessState();
  input.focus();

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var pin = input.value.trim();

    setStatus("", "");
    setBusy(true);

    fetch(AUTH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ pin: pin })
    })
      .then(function (response) {
        if (response.status === 401) {
          throw new Error("wrong-pin");
        }

        if (!response.ok) {
          throw new Error("service-error");
        }

        return response.json();
      })
      .then(function (data) {
        if (
          !data ||
          typeof data.token !== "string" ||
          !data.token.trim()
        ) {
          throw new Error("service-error");
        }

        sessionStorage.setItem(
          TOKEN_KEY,
          data.token
        );

        if (Number.isFinite(Number(data.expires_in))) {
          sessionStorage.setItem(
            TOKEN_EXPIRES_KEY,
            String(
              Date.now() +
              Number(data.expires_in) * 1000
            )
          );
        }

        setStatus(
          "Access accepted. Opening lift menu...",
          "success"
        );

        window.setTimeout(function () {
          window.location.href = redirectPage;
        }, 650);
      })
      .catch(function (error) {
        if (
          error &&
          error.message === "wrong-pin"
        ) {
          setStatus(
            "Wrong PIN.",
            "error"
          );
        } else {
          setStatus(
            "Unable to verify access. Try again later.",
            "error"
          );
        }

        input.value = "";
        setBusy(false);
        input.focus();
      });
  });
})();
