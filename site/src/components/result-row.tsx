import { useEffect, useRef, useState } from "react";
import { formatSize, type Tone } from "../lib/upload";

export interface UploadRow {
  id: number;
  label: string;
  /** Bytes, or null for a link until the API reports the stored size. */
  size: number | null;
  status: string;
  tone?: Tone;
  /** Upload progress from 0 to 1, or null while no upload is in flight. */
  progress: number | null;
  url: string | null;
}

/** How long the Copy button shows its result before it reads "Copy" again. */
const COPIED_LABEL_MS = 2000;
const MANUAL_COPY_LABEL_MS = 4000;

export function ResultRow({ row }: { row: UploadRow }) {
  const { url } = row;
  const linkRef = useRef<HTMLInputElement>(null);
  const [copyLabel, setCopyLabel] = useState("Copy");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    },
    [],
  );

  function showCopyResult(label: string, durationMs: number) {
    setCopyLabel(label);
    // A second click restarts the countdown instead of letting an earlier timer cut it short.
    if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      resetTimerRef.current = null;
      setCopyLabel("Copy");
    }, durationMs);
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      showCopyResult("Copied", COPIED_LABEL_MS);
    } catch {
      linkRef.current?.focus();
      linkRef.current?.select();
      showCopyResult("Press Ctrl+C", MANUAL_COPY_LABEL_MS);
    }
  }

  return (
    <li className="result">
      <div className="result-name">{row.size === null ? row.label : `${row.label} (${formatSize(row.size)})`}</div>
      <p className="result-status" data-tone={row.tone}>
        {row.status}
      </p>
      {/* Progress lives outside the status text so the results live region only announces state changes, not
          every percentage tick. */}
      <progress
        className="result-progress"
        max={1}
        value={row.progress ?? 0}
        hidden={row.progress === null}
        aria-label={`Upload progress for ${row.label}`}
      />
      {url !== null && (
        <div className="result-link">
          <input
            ref={linkRef}
            type="text"
            readOnly
            value={url}
            aria-label={`Link for ${row.label}`}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button type="button" className="button button-secondary" onClick={() => void copyLink(url)}>
            {copyLabel}
          </button>
          <a className="button button-secondary" href={url} target="_blank" rel="noopener noreferrer">
            Open
          </a>
        </div>
      )}
    </li>
  );
}
