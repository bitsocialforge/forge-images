import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { ResultRow, type UploadRow } from "../components/result-row";
import { SiteLayout } from "../components/site-layout";
import { resolveSiteConfig } from "../lib/config";
import { checkFile, sendOne, type UploadRowHandle } from "../lib/upload";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,.swf,application/x-shockwave-flash";

export function UploadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hideFilenameRef = useRef<HTMLInputElement>(null);
  const turnstileSlotRef = useRef<HTMLDivElement>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const nextRowIdRef = useRef(0);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = useCallback((files: FileList) => {
    // Read the option now: toggling it later must not change files already added.
    const hideName = hideFilenameRef.current?.checked ?? false;
    for (const file of Array.from(files)) {
      const id = nextRowIdRef.current++;
      const updateRow = (patch: Partial<UploadRow>) =>
        setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
      const check = checkFile(file);
      const row: UploadRow = {
        id,
        label: file.name || "pasted file",
        size: file.size,
        status: check.ok ? "Queued." : check.message,
        tone: check.ok ? undefined : "error",
        progress: null,
        url: null,
      };
      // Newest first.
      setRows((current) => [row, ...current]);
      if (!check.ok) continue;

      const handle: UploadRowHandle = {
        setStatus: (status, tone) => updateRow({ status, tone }),
        setProgress: (progress) => updateRow({ progress }),
        showLink: (url) => updateRow({ url }),
      };
      // One upload at a time: each needs its own Turnstile token and rate-limit slot.
      queueRef.current = queueRef.current.then(() => {
        const slot = turnstileSlotRef.current;
        if (!slot) return;
        return sendOne(file, handle, { hideName, slot, config: resolveSiteConfig(window.location) });
      });
    }
  }, []);

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

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer?.files.length) addFiles(event.dataTransfer.files);
  }

  return (
    <SiteLayout current="upload">
      <h1>Free image and video hosting</h1>
      <p className="lede">
        Anonymous, free, and no expiry. Upload an image or video and get a link you can post anywhere.{" "}
        <a href="https://5chan.app">5chan</a> uses Forge Images for its upload button.
      </p>

      <section
        id="dropzone"
        className={isDragging ? "dropzone is-dragging" : "dropzone"}
        aria-label="Upload files"
        onDragOver={onDragOver}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <button id="choose-button" className="button" type="button" onClick={() => fileInputRef.current?.click()}>
          Choose files
        </button>
        <p>or drop them here, or paste with Ctrl+V</p>
        <p className="muted">JPEG, PNG, WebP up to 10 MB · GIF and SWF up to 20 MB · MP4 and WebM up to 50 MB</p>
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
      </section>

      <label className="option">
        <input ref={hideFilenameRef} id="hide-filename" type="checkbox" />
        Leave my filename out of the link
      </label>

      {/* getTurnstileToken mounts each one-shot widget here, outside React's rendering. */}
      <div ref={turnstileSlotRef} id="turnstile-slot" className="turnstile-slot" />

      <ol id="results" className="results" aria-live="polite">
        {rows.map((row) => (
          <ResultRow key={row.id} row={row} />
        ))}
      </ol>

      <p className="muted upload-terms">
        By uploading you agree to the <a href="/legal#terms">Terms</a> and{" "}
        <a href="/legal#acceptable-use">Acceptable Use Policy</a>. Adult content is allowed; illegal content is not.
        Metadata such as GPS location is removed from images and videos before they are served. See the{" "}
        <a href="/legal#privacy">Privacy Policy</a>.
      </p>
    </SiteLayout>
  );
}
