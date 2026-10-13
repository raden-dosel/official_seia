(function () {
  function wire() {
    const form = document.getElementById("contact-form");
    const submit = document.getElementById("submit-btn");
    const btnLabel = submit ? submit.querySelector(".btn-label") : null;
    const feedback = document.getElementById("form-feedback");
    const successCard = document.getElementById("form-success-card");
    const clientNameSpan = document.getElementById("success-client-name");
    const btnSendAnother = document.getElementById("btn-send-another");
    const serviceSelect = document.getElementById("service");
    const messageInput = document.getElementById("message");
    const charCounter = document.getElementById("char-counter");

    if (!form || !submit) return false;

    // Prevent duplicate event listener registration if wire() is called multiple times
    if (form.dataset.wired === "true") return true;
    form.dataset.wired = "true";

    // Helpers
    const getField = (id) => form.querySelector(`#${id}`);
    const setError = (id, msg) => {
      const help = form.querySelector(`.error[data-for="${id}"]`);
      const input = getField(id);
      if (help) help.textContent = msg || "";
      if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
    };

    // Track fields interacted with
    const touched = new Set();
    let isSubmitting = false;

    const validators = {
      name: (v) => (v.trim().length >= 2 ? true : "Please enter your full name (at least 2 characters)."),
      email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? true : "Please enter a valid email address."),
      phone: (v) => {
        const val = v.trim();
        if (!val) return true; // Optional field
        return /^[0-9+()\-.\s]{7,25}$/.test(val) ? true : "Please enter a valid phone number or leave blank.";
      },
      service: (v) => (Boolean(v && v.trim()) ? true : "Please select a service."),
      location: () => true, // Optional field
      message: (v) => (v.trim().length >= 10 ? true : "Please describe your project or questions (minimum 10 characters)."),
    };

    const validateField = (id, show = true) => {
      const input = getField(id);
      if (!input || !validators[id]) return true;
      const result = validators[id](input.value);
      if (!show) return result === true;
      if (result === true) {
        setError(id, "");
        return true;
      }
      setError(id, result);
      return false;
    };

    // Message character counter
    if (messageInput && charCounter) {
      const updateCount = () => {
        const len = messageInput.value.length;
        charCounter.textContent = `${len} / 2000`;
        if (len > 1950) {
          charCounter.classList.add("char-counter--limit");
        } else {
          charCounter.classList.remove("char-counter--limit");
        }
      };
      messageInput.addEventListener("input", updateCount);
      updateCount();
    }

    // Dynamic submit button label based on service selection
    const updateSubmitLabel = () => {
      if (!btnLabel || isSubmitting) return;
      if (serviceSelect && serviceSelect.value.includes("Assessment")) {
        btnLabel.textContent = "Submit Assessment Request";
      } else {
        btnLabel.textContent = "Submit Project Inquiry";
      }
    };

    if (serviceSelect) {
      serviceSelect.addEventListener("change", () => {
        updateSubmitLabel();
        if (touched.has("service")) validateField("service", true);
      });
      updateSubmitLabel();
    }

    // Input events
    form.addEventListener("focusin", (e) => {
      const id = e.target && e.target.id;
      if (id && validators[id]) touched.add(id);
    });

    form.addEventListener("input", (e) => {
      const id = e.target && e.target.id;
      if (id && validators[id]) validateField(id, touched.has(id));
    }, true);

    form.addEventListener("blur", (e) => {
      const id = e.target && e.target.id;
      if (id && validators[id]) {
        touched.add(id);
        validateField(id, true);
      }
    }, true);

    // "Send Another Inquiry" action
    if (btnSendAnother && successCard) {
      btnSendAnother.addEventListener("click", () => {
        successCard.hidden = true;
        form.style.display = "";
        form.reset();
        touched.clear();
        ["name", "email", "phone", "service", "location", "message"].forEach((id) => setError(id, ""));
        if (messageInput && charCounter) {
          charCounter.textContent = "0 / 2000";
        }
        updateSubmitLabel();
        const nameField = getField("name");
        if (nameField) nameField.focus();
      });
    }

    // Web3Forms API submission handler with duplicate suppression
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      // Guard against rapid duplicate clicks or submissions already in flight
      if (isSubmitting) return;

      // Mark required fields as touched and validate
      const fieldsToValidate = ["name", "email", "phone", "service", "message"];
      fieldsToValidate.forEach((id) => touched.add(id));

      let firstInvalidId = null;
      let allValid = true;

      fieldsToValidate.forEach((id) => {
        const ok = validateField(id, true);
        if (!ok) {
          allValid = false;
          if (!firstInvalidId) firstInvalidId = id;
        }
      });

      if (!allValid) {
        if (firstInvalidId) {
          const firstInvalidEl = getField(firstInvalidId);
          if (firstInvalidEl) firstInvalidEl.focus();
        }
        return;
      }

      // Anti-Spam: Silent drop if honeypot checkbox was filled by automated bot
      const botCheck = form.querySelector('input[name="botcheck"]');
      if (botCheck && botCheck.checked) {
        return;
      }

      isSubmitting = true;

      // UX: Disable submit button & update text to "Submitting..."
      submit.disabled = true;
      submit.classList.add("is-loading");
      if (btnLabel) {
        btnLabel.textContent = "Submitting...";
      }

      if (feedback) {
        feedback.textContent = "";
        feedback.className = "feedback";
      }

      const formData = new FormData(form);
      const submittedName = (getField("name")?.value || "").trim();

      try {
        const response = await fetch("https://api.web3forms.com/submit", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (response.status === 200 && data.success) {
          // Dynamic success state card
          if (successCard) {
            if (clientNameSpan) {
              clientNameSpan.textContent = submittedName || "there";
            }
            form.style.display = "none";
            successCard.hidden = false;
            successCard.focus();
          } else if (feedback) {
            feedback.textContent = "Inquiry sent successfully! We will contact you within 1 business day.";
            feedback.className = "feedback feedback--success";
          }

          // Clear form fields
          form.reset();
          touched.clear();
          fieldsToValidate.forEach((id) => setError(id, ""));
          if (charCounter) charCounter.textContent = "0 / 2000";
        } else {
          // Dynamic error feedback using safe DOM APIs (prevents XSS from API message reflection)
          if (feedback) {
            feedback.textContent = "";
            const strong = document.createElement("strong");
            strong.textContent = "Submission issue: ";
            feedback.appendChild(strong);
            const errorMsg = data && typeof data.message === "string" ? data.message : "Failed to submit inquiry. Please call 0977 015 9162 directly.";
            feedback.appendChild(document.createTextNode(errorMsg));
            feedback.className = "feedback feedback--error";
          }
        }
      } catch (error) {
        console.error("Web3Forms submission network error:", error);
        if (feedback) {
          feedback.textContent = "";
          const strong = document.createElement("strong");
          strong.textContent = "Network error: ";
          feedback.appendChild(strong);
          feedback.appendChild(document.createTextNode("Unable to connect. Please reach out directly via call/SMS at 0977 015 9162 or email "));
          const mailLink = document.createElement("a");
          mailLink.href = "mailto:sherwinmadrid210@gmail.com";
          mailLink.textContent = "sherwinmadrid210@gmail.com";
          feedback.appendChild(mailLink);
          feedback.appendChild(document.createTextNode("."));
          feedback.className = "feedback feedback--error";
        }
      } finally {
        // Restore submission lock & button state
        isSubmitting = false;
        submit.disabled = false;
        submit.classList.remove("is-loading");
        updateSubmitLabel();
      }
    });

    return true;
  }

  async function loadInto(id, url) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.querySelector('#contact-form')) {
      wire();
      return;
    }
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
      const html = await res.text();
      const tmp = document.createElement("div");
      tmp.innerHTML = html.trim();
      const sec = tmp.querySelector(`section#${id}`);
      el.innerHTML = sec ? sec.innerHTML : html;
      wire();
    } catch (err) {
      console.warn("Contact load failed:", err);
      el.innerHTML = "<p>Failed to load contact section.</p>";
    }
  }

  function initWhenReady() {
    if (wire()) return;
    const root = document.getElementById("contact");
    if (!root) return;
    const mo = new MutationObserver(() => {
      if (wire()) mo.disconnect();
    });
    mo.observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWhenReady);
  } else {
    initWhenReady();
  }

  window.Contact = { loadInto };
})();
