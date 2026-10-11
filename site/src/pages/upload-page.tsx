import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { ResultRow, type UploadRow } from "../components/result-row";
import { SiteLayout } from "../components/site-layout";
import { resolveSiteConfig } from "../lib/config";
import {
  checkFile,
  checkUrl,
  describeLimits,
  sendOne,
  sendUrl,
  type SendOptions,
  type UploadRowHandle,
} from "../lib/upload";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,.swf,application/x-shockwave-flash";

type Send = (row: UploadRowHandle, options: SendOptions) => Promise<void>;

export function UploadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const hideFilenameRef = useRef<HTMLInputElement>(null);
  const turnstileSlotRef = useRef<HTMLDivElement>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const nextRowIdRef = useRef(0);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUrlFormOpen, setIsUrlFormOpen] = useState(false);

  /** Adds a row (newest first) and queues its upload, or only shows the row when `send` is null (a failed check). */
  const addRow = useCallback((row: Pick<UploadRow, "label" | "size" | "status" | "tone">, send: Send | null) => {
    const id = nextRowIdRef.current++;
    setRows((current) => [{ ...row, id, progress: null, url: null }, ...current]);
    if (!send) return;

    // Read the option now: toggling it later must not change uploads already added.
    const hideName = hideFilenameRef.current?.checked ?? false;
    const updateRow = (patch: Partial<UploadRow>) =>
      setRows((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    const handle: UploadRowHandle = {
      setStatus: (status, tone) => updateRow({ status, tone }),
      setProgress: (progress) => updateRow({ progress }),
      setSize: (size) => updateRow({ size }),
      showLink: (url) => updateRow({ url }),
    };
    // One upload at a time: each needs its own Turnstile token and rate-limit slot.
    queueRef.current = queueRef.current.then(() => {
      const slot = turnstileSlotRef.current;
      if (!slot) return;
      return send(handle, { hideName, slot, config: resolveSiteConfig(window.location) });
    });
  }, []);

  const addFiles = useCallback(
    (files: FileList) => {
      for (const file of Array.from(files)) {
        const check = checkFile(file);
        addRow(
          {
            label: file.name || "pasted file",
            size: file.size,
            status: check.ok ? "Queued." : check.message,
            tone: check.ok ? undefined : "error",
          },
          check.ok ? (handle, options) => sendOne(file, handle, options) : null,
        );
      }
    },
    [addRow],
  );

  useEffect(() => {
    // A file dropped outside the drop zone would otherwise navigate away from the page.
    const preventDefault = (event: Event) => event.preventDefault();
    const onPaste = (event: ClipboardEvent) => {
      const files = event.clipboardData?.files;
      if (files?.length) {
        event.preventDefault();
        addFiles(files);
      }
    };
    window.addEventListener("dragover", preventDefault);
    window.addEventListener("drop", preventDefault);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragover", preventDefault);
      window.removeEventListener("drop", preventDefault);
      document.removeEventListener("paste", onPaste);
    };
  }, [addFiles]);

  function onDragOver(event: DragEvent) {
    event.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave(event: DragEvent<HTMLElement>) {
    // Moving onto a child (the button, a result row) is still inside the drop zone.
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setIsDragging(false);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer?.files.length) addFiles(event.dataTransfer.files);
  }

  function toggleUrlForm() {
    // Commit the reveal first, so the input can take focus.
    flushSync(() => setIsUrlFormOpen((open) => !open));
    if (!isUrlFormOpen) urlInputRef.current?.focus();
  }

  function onUrlSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = urlInputRef.current;
    if (!input) return;
    const check = checkUrl(input.value);
    if (!check.ok) {
      input.setCustomValidity(check.message);
      input.reportValidity();
      return;
    }
    const { url } = check;
    addRow({ label: url, size: null, status: "Queued." }, (handle, options) => sendUrl(url, handle, options));
    input.value = "";
  }

  return (
    <SiteLayout current="upload">
      <h1 className="visually-hidden">Free image and video hosting</h1>
      <p className="upload-notice">
        {describeLimits()}. You should <a href="/faq">read the FAQ</a>.
      </p>

      <section
        id="dropzone"
        className={isDragging ? "dropzone is-dragging" : "dropzone"}
        aria-label="Upload files"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {/* The whole box above the results is one button. The results are its siblings, so their links and
            buttons never open the file picker. */}
        <button
          id="choose-button"
          className="dropzone-button"
          type="button"
          aria-labelledby="choose-label"
          aria-describedby="choose-hint"
          onClick={() => fileInputRef.current?.click()}
        >
          <span id="choose-label" className="button">
            Choose files
          </span>
          <span id="choose-hint">or drop them here, or paste with Ctrl+V</span>
        </button>
        <input
          ref={fileInputRef}
          id="file-input"
          type="file"
          multiple
          hidden
          accept={ACCEPT}
          onChange={(event) => {
            const input = event.currentTarget;
            if (input.files) addFiles(input.files);
            input.value = "";
          }}
        />

        {/* getTurnstileToken mounts each one-shot widget here, outside React's rendering. */}
        <div ref={turnstileSlotRef} id="turnstile-slot" className="turnstile-slot" />

        <ol id="results" className="results" aria-live="polite">
          {rows.map((row) => (
            <ResultRow key={row.id} row={row} />
          ))}
        </ol>
      </section>

      <div className="url-upload">
        <button
          type="button"
          className="text-button"
          aria-expanded={isUrlFormOpen}
          aria-controls="url-form"
          onClick={toggleUrlForm}
        >
          Upload via URL
        </button>
        <form id="url-form" className="url-form" hidden={!isUrlFormOpen} onSubmit={onUrlSubmit}>
          <label htmlFor="url-input" className="visually-hidden">
            Link to an image or video
          </label>
          <input
            ref={urlInputRef}
            id="url-input"
            type="url"
            required
            placeholder="https://…"
            autoComplete="off"
            spellCheck={false}
            onInput={(event) => event.currentTarget.setCustomValidity("")}
          />
          <button className="button" type="submit">
            Go
          </button>
        </form>
      </div>

      <label className="option">
        <input ref={hideFilenameRef} id="hide-filename" type="checkbox" />
        Leave my filename out of the link
      </label>

      <p className="muted upload-terms">
        By uploading you agree to the <a href="/legal#terms">Terms</a> and{" "}
        <a href="/legal#acceptable-use">Acceptable Use Policy</a>. Adult content is allowed; illegal content is not.
        Metadata such as GPS location is removed from images and videos before they are served. See the{" "}
        <a href="/legal#privacy">Privacy Policy</a>.
      </p>
    </SiteLayout>
  );
}
