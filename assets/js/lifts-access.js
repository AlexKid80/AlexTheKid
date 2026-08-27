(function () {
  var acceptedHashes = [
    "e0bc60c82713f64ef8a57c0c40d02ce24fd0141d5cc3086259c19b1e62a62bea",
    "87f9fa18aa8627ef9b012db905a96651a9d49c891899e268c44468e9a854960c",
    "d12a292854352113e316d0e472f556ba3ef08ddcec759dcd26dd7e295ad85898"
  ];

  var redirectPage = "lifts.html";
  var form = document.getElementById("accessForm");
  var input = document.getElementById("pinInput");
  var status = document.getElementById("statusMessage");

  if (!form || !input || !status) {
    return;
  }

  function toHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var result = "";

    for (var i = 0; i < bytes.length; i++) {
      result += bytes[i].toString(16).padStart(2, "0");
    }

    return result;
  }

  function sha256(text) {
    var encoder = new TextEncoder();
    var data = encoder.encode(text);

    return crypto.subtle.digest("SHA-256", data).then(function (hashBuffer) {
      return toHex(hashBuffer);
    });
  }

  function setStatus(message, type) {
    status.textContent = message;
    status.className = "status-message";

    if (type) {
      status.classList.add(type);
    }
  }

  input.focus();

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var pin = input.value.trim();

    if (!pin) {
      setStatus("Enter PIN first.", "error");
      input.focus();
      return;
    }

    if (!/^[0-9]{6}$/.test(pin)) {
      setStatus("PIN must be 6 digits.", "error");
      input.value = "";
      input.focus();
      return;
    }

    sha256(pin).then(function (pinHash) {
      if (acceptedHashes.indexOf(pinHash) !== -1) {
        sessionStorage.setItem("axl_lifts_access", "ok");
        setStatus("Access accepted. Opening lift menu...", "success");

        setTimeout(function () {
          window.location.href = redirectPage;
        }, 650);
      } else {
        setStatus("Wrong PIN. Access denied.", "error");
        input.value = "";
        input.focus();
      }
    }).catch(function () {
      setStatus("Access check failed. Try again.", "error");
      input.value = "";
      input.focus();
    });
  });
})();