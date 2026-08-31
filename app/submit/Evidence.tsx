"use client";

import { useRef, useState } from "react";
import { MAX_FILE_BYTES, MAX_FILES, humanSize } from "@/lib/uploads";

export default function Evidence() {
  const filesInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [filesErr, setFilesErr] = useState<string | null>(null);

  function acceptFiles(list: FileList | null) {
    setFilesErr(null);
    if (!list || !list.length) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        setFilesErr(`Up to ${MAX_FILES} files.`);
        break;
      }
      if (f.size > MAX_FILE_BYTES) {
        setFilesErr(`"${f.name}" is over ${humanSize(MAX_FILE_BYTES)}.`);
        continue;
      }
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    setFiles(next);
    sync(next);
  }

  function removeFile(i: number) {
    const next = files.filter((_, idx) => idx !== i);
    setFiles(next);
    sync(next);
  }

  function sync(next: File[]) {
    if (!filesInput.current) return;
    const dt = new DataTransfer();
    next.forEach((f) => dt.items.add(f));
    filesInput.current.files = dt.files;
  }

  return (
    <div className="evidence">
      <div className="field">
        <label className="flabel">
          Demo video link <span className="opt">preferred</span>
        </label>
        <p className="fhelp">
          Upload to OneDrive, share as &ldquo;anyone with the link can view&rdquo;,
          and paste that link.
        </p>
        <div className="ev-input">
          <span className="ev-prefix" aria-hidden="true">▶</span>
          <input type="url" name="demoVideoUrl" placeholder="https://1drv.ms/v/…" />
        </div>
      </div>

      <div className="row2">
        <div className="field">
          <label className="flabel">
            Live link <span className="opt">optional</span>
          </label>
          <div className="ev-input">
            <span className="ev-prefix" aria-hidden="true">◐</span>
            <input type="url" name="liveLink" placeholder="https://app.example.com/demo" />
          </div>
        </div>
        <div className="field">
          <label className="flabel">
            Code repository <span className="opt">optional</span>
          </label>
          <div className="ev-input">
            <span className="ev-prefix" aria-hidden="true">{"</>"}</span>
            <input type="url" name="repoLink" placeholder="https://github.com/org/project" />
          </div>
        </div>
      </div>

      <div className="field">
        <label className="flabel">
          Files <span className="opt">optional</span>
        </label>
        <p className="fhelp">
          Up to {MAX_FILES}, {humanSize(MAX_FILE_BYTES)} each.
        </p>
        <input
          ref={filesInput}
          type="file"
          name="files"
          multiple
          className="sr-file"
          tabIndex={-1}
          onChange={(e) => acceptFiles(e.target.files)}
        />
        <button
          type="button"
          className="dropzone"
          onClick={() => filesInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            acceptFiles(e.dataTransfer.files);
          }}
        >
          <span className="dz-title">Add files</span>
        </button>

        {files.length > 0 && (
          <ul className="ev-filelist">
            {files.map((f, i) => (
              <li key={f.name + f.size}>
                <span>
                  {f.name}
                  <span className="muted"> · {humanSize(f.size)}</span>
                </span>
                <button type="button" className="ev-x" onClick={() => removeFile(i)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {filesErr && <p className="ev-err">{filesErr}</p>}
      </div>
    </div>
  );
}
