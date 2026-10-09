import { API_ORIGIN } from "./config.js";

const form = document.getElementById("report-form");
const urlInput = document.getElementById("report-url");
const reasonInput = document.getElementById("report-reason");
const detailInput = document.getElementById("report-detail");
const submit = document.getElementById("report-submit");
const status = document.getElementById("report-status");

// Lets clients link straight to a prefilled report: report.html?url=<file link>
const prefill = new URLSearchParams(location.search).get("url");
if (prefill) urlInput.value = prefill;

function setStatus(text, tone) {
  status.textContent = text;
  if (tone) status.dataset.tone = tone;
  else delete status.dataset.tone;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = urlInput.value.trim();
  if (!url) {
    setStatus("Paste the link to the file you are reporting.", "error");
    urlInput.focus();
    return;
  }

  submit.disabled = true;
  setStatus("Sending…");
  try {
    const response = await fetch(`${API_ORIGIN}/api/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, reason: reasonInput.value, detail: detailInput.value.trim() || undefined }),
    });
    if (response.status === 202) {
      form.reset();
      setStatus("Report received. Thank you.", "ok");
      return;
    }
    if (response.status === 429) {
      setStatus("Too many reports from your connection. Try again later or email abuse@bitsocialforge.com.", "error");
      return;
    }
    const body = await response.json().catch(() => null);
    setStatus(
      body?.error?.message ? `Not sent: ${body.error.message}` : `Not sent (HTTP ${response.status}).`,
      "error",
    );
  } catch {
    setStatus("Network error. Try again, or email abuse@bitsocialforge.com.", "error");
  } finally {
    submit.disabled = false;
  }
});
