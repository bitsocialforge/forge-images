import { reportFile, type ReportReason } from "@bitsocialforge/forge-images-client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { SiteLayout } from "../components/site-layout";
import { resolveSiteConfig } from "../lib/config";
import { describeReportFailure } from "../lib/report";
import type { Tone } from "../lib/upload";

export function ReportPage() {
  const urlRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLSelectElement>(null);
  const detailRef = useRef<HTMLTextAreaElement>(null);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ text: string; tone?: Tone }>({ text: "" });

  useEffect(() => {
    // Lets clients link straight to a prefilled report: /report?url=<file link>. Applied after hydration so the
    // prerendered field matches the server markup.
    const prefill = new URLSearchParams(window.location.search).get("url");
    if (prefill && urlRef.current) urlRef.current.value = prefill;
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const urlInput = urlRef.current;
    if (!urlInput || !reasonRef.current || !detailRef.current) return;
    const url = urlInput.value.trim();
    if (!url) {
      setStatus({ text: "Paste the link to the file you are reporting.", tone: "error" });
      urlInput.focus();
      return;
    }

    setSending(true);
    setStatus({ text: "Sending…" });
    try {
      await reportFile(
        {
          url,
          reason: reasonRef.current.value as ReportReason,
          detail: detailRef.current.value.trim() || undefined,
        },
        { apiOrigin: resolveSiteConfig(window.location).apiOrigin },
      );
      form.reset();
      setStatus({ text: "Report received. Thank you.", tone: "ok" });
    } catch (error) {
      setStatus({ text: describeReportFailure(error), tone: "error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <SiteLayout current="report">
      <h1>Report a file</h1>
      <p className="lede">
        Use this form to report a file that breaks the <a href="/legal#acceptable-use">Acceptable Use Policy</a> or the
        law. Reported files are re-checked automatically right away. A person reads every email to{" "}
        <a href="mailto:abuse@bitsocialforge.com">abuse@bitsocialforge.com</a>, so email us too when a report is urgent.
        Illegal files are removed at every link that points to them.
      </p>
      <ul>
        <li>
          <strong>Child sexual abuse material:</strong> choose that reason below <em>and</em> email the link to{" "}
          <a href="mailto:abuse@bitsocialforge.com">abuse@bitsocialforge.com</a> so a person acts on it immediately. Do
          not download, screenshot, or share it. You can also report it to{" "}
          <a href="https://report.cybertip.org/">NCMEC's CyberTipline</a> or your local police.
        </li>
        <li>
          <strong>Copyright:</strong> this form triggers a re-check, but a formal takedown needs a DMCA notice. See{" "}
          <a href="/legal#copyright">Copyright and DMCA</a>.
        </li>
        <li>
          You can also email <a href="mailto:abuse@bitsocialforge.com">abuse@bitsocialforge.com</a>, for example to
          include screenshots of where the file was posted.
        </li>
      </ul>

      <form id="report-form" noValidate onSubmit={(event) => void onSubmit(event)}>
        <div className="field">
          <label htmlFor="report-url">Link to the file</label>
          <input ref={urlRef} id="report-url" name="url" type="url" required placeholder="https://forgeimg.net/…" />
        </div>
        <div className="field">
          <label htmlFor="report-reason">Reason</label>
          <select ref={reasonRef} id="report-reason" name="reason">
            <option value="illegal">Illegal content (other than below)</option>
            <option value="csam">Child sexual abuse material</option>
            <option value="dmca">Copyright infringement</option>
            <option value="other">Other Acceptable Use Policy violation</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="report-detail">Details (optional)</label>
          <textarea ref={detailRef} id="report-detail" name="detail" maxLength={4000} />
        </div>
        <p className="muted">
          We record your report and your IP address to handle it and to prevent abuse of this form. See the{" "}
          <a href="/legal#privacy">Privacy Policy</a>.
        </p>
        <button id="report-submit" className="button" type="submit" disabled={sending}>
          Send report
        </button>
        <p id="report-status" className="form-status" role="status" data-tone={status.tone}>
          {status.text}
        </p>
      </form>
    </SiteLayout>
  );
}
