(function () {
  "use strict";

  // Separate from the Lifts PIN authentication and its session keys.
  const API_BASE = "https://elevatorsbackend.onrender.com";
  const LOGIN_URL = API_BASE + "/stats/auth/login";
  const WAKE_URL = API_BASE + "/wake";
  const TOKEN_KEY = "axl_stats_token";
  const EXPIRES_KEY = "axl_stats_token_expires";
  const DASHBOARD_PAGE = "stats.html";

  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  const reveals = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    reveals.forEach(element => element.classList.add("show"));
  } else {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("show");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    reveals.forEach(element => observer.observe(element));
  }

  const form = document.getElementById("accessForm");
  const pinInput = document.getElementById("pinInput");
  const status = document.getElementById("statusMessage");
  const submitButton = form && form.querySelector('button[type="submit"]');
  const wakeButton = document.getElementById("wakeServerButton");
  if (!form || !pinInput || !status || !submitButton) return;

  function setStatus(message, type = "") {
    status.textContent = message;
    status.className = "status-message";
    if (type) status.classList.add(type);
  }

  function setBusy(busy) {
    pinInput.disabled = busy;
    submitButton.disabled = busy;
  }

  pinInput.focus();

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    const pin = pinInput.value.trim();
    if (!/^[0-9]{1,128}$/.test(pin)) {
      setStatus("Please enter your numeric administrator PIN.", "error");
      pinInput.focus();
      return;
    }

    setStatus("Checking administrator PIN...");
    setBusy(true);

    try {
      const response = await fetch(LOGIN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ pin }),
        cache: "no-store"
      });

      if (response.status === 401) {
        throw new Error("wrong-pin");
      }
      if (!response.ok) {
        throw new Error("service-error");
      }

      const result = await response.json();
      if (!result || typeof result.token !== "string" || !result.token) {
        throw new Error("service-error");
      }

      // Statistics-only browser session; never modify axl_lifts_token.
      sessionStorage.setItem(TOKEN_KEY, result.token);
      const ttl = Number(result.expires_in);
      if (Number.isFinite(ttl) && ttl > 0) {
        sessionStorage.setItem(EXPIRES_KEY, String(Date.now() + ttl * 1000));
      } else {
        sessionStorage.removeItem(EXPIRES_KEY);
      }

      pinInput.value = "";
      setStatus("Access granted. Opening Statistics Dashboard...", "success");
      window.location.assign(DASHBOARD_PAGE);
    } catch (error) {
      // Prevent stale Statistics tokens from surviving a failed login.
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(EXPIRES_KEY);
      pinInput.value = "";
      if (error && error.message === "wrong-pin") {
        setStatus("Wrong PIN or access temporarily locked.", "error");
      } else {
        setStatus("Unable to verify access. Wake the server and try again.", "error");
      }
      pinInput.focus();
      setBusy(false);
    }
  });

  if (wakeButton) {
    wakeButton.addEventListener("click", async function () {
      wakeButton.disabled = true;
      setStatus("Waking the server...");
      try {
        const response = await fetch(WAKE_URL, { method: "GET", cache: "no-store" });
        if (!response.ok) throw new Error("wake-failed");
        setStatus("Server is awake. Enter your administrator PIN.", "success");
      } catch (error) {
        setStatus("Server did not respond. Try again shortly.", "error");
      } finally {
        wakeButton.disabled = false;
      }
    });
  }
})();
