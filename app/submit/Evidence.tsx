"use client";

import { useRef, useState } from "react";
import {
  MAX_VIDEO_BYTES,
  MAX_FILE_BYTES,
  MAX_FILES,
  ACCEPTED_VIDEO_EXT,
  humanSize,
  isVideo,
} from "@/lib/uploads";

export default function Evidence() {
  const videoInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);

  const [video, setVideo] = useState<File | null>(null);
  const [videoErr, setVideoErr] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [filesErr, setFilesErr] = useState<string | null>(null);

  const [dragging, setDragging] = useState(false);

  function acceptVideo(f: File | undefined) {
    setVideoErr(null);
    if (!f) return;
    if (!isVideo(f)) {
      setVideoErr(`Use ${ACCEPTED_VIDEO_EXT.join(", ")}. That file looks like ${f.type || "an unknown type"}.`);
      return;
    }
    if (f.size > MAX_VIDEO_BYTES) {
      setVideoErr(`That video is ${humanSize(f.size)}. The limit is ${humanSize(MAX_VIDEO_BYTES)} — please trim or compress it.`);
      return;
    }
    setVideo(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
    // keep the real <input> in sync so the form submits the file
    if (videoInput.current) {
      const dt = new DataTransfer();
      dt.items.add(f);
      videoInput.current.files = dt.files;
    }
  }

  function clearVideo() {
    setVideo(null);
    setVideoErr(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (videoInput.current) videoInput.current.value = "";
  }

  function acceptFiles(list: FileList | null) {
    setFilesErr(null);
    if (!list || !list.length) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        setFilesErr(`Up to ${MAX_FILES} supporting files.`);
        break;
      }
      if (f.size > MAX_FILE_BYTES) {
        setFilesErr(`"${f.name}" is ${humanSize(f.size)} — each file must be under ${humanSize(MAX_FILE_BYTES)}.`);
        continue;
      }
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    setFiles(next);
    syncFiles(next);
  }

  function removeFile(i: number) {
    const next = files.filter((_, idx) => idx !== i);
    setFiles(next);
    syncFiles(next);
  }

  function syncFiles(next: File[]) {
    if (!filesInput.current) return;
    const dt = new DataTransfer();
    next.forEach((f) => dt.items.add(f));
    filesInput.current.files = dt.files;
  }

  return (
    <div className="evidence">
      {/* ---------- demo video ---------- */}
      <div className="ev-block">
        <div className="ev-head">
          <span className="ev-ico" aria-hidden="true">▶</span>
          <div>
            <b>Product demo video</b>
            <span className="opt"> preferred</span>
            <p className="ev-sub">
              Strongly encouraged — reviewers watch it first. A short screen
              recording of the solution working, ~2 minutes, compressed (1080p is
              plenty).
              {" "}{ACCEPTED_VIDEO_EXT.join(" / ")}, up to {humanSize(MAX_VIDEO_BYTES)}.
            </p>
          </div>
        </div>

        {/* real file input the server action reads; kept off-screen */}
        <input
          ref={videoInput}
          type="file"
          name="demoVideo"
          accept={ACCEPTED_VIDEO_EXT.join(",") + ",video/*"}
          className="sr-file"
          tabIndex={-1}
          onChange={(e) => acceptVideo(e.target.files?.[0])}
        />

        {!video ? (
          <button
            type="button"
            className={dragging ? "dropzone over" : "dropzone"}
            onClick={() => videoInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              acceptVideo(e.dataTransfer.files?.[0]);
            }}
          >
            <span className="dz-title">Drop your demo video here, or browse</span>
            <span className="dz-hint">
              Reviewers watch this first — {humanSize(MAX_VIDEO_BYTES)} max
            </span>
          </button>
        ) : (
          <div className="ev-uploaded">
            {previewUrl && (
              <video className="ev-video" src={previewUrl} controls preload="metadata" />
            )}
            <div className="ev-file-row">
              <div>
                <b>{video.name}</b>
                <span className="muted"> · {humanSize(video.size)}</span>
              </div>
              <button type="button" className="btn ghost sm" onClick={clearVideo}>
                Replace
              </button>
            </div>
          </div>
        )}
        {videoErr && <p className="ev-err">{videoErr}</p>}
      </div>

      {/* ---------- links ---------- */}
      <div className="ev-links">
        <div className="field">
          <label className="flabel">
            Live link <span className="opt">if reviewers can try it</span>
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

      {/* ---------- supporting files ---------- */}
      <div className="ev-block">
        <div className="ev-head">
          <span className="ev-ico" aria-hidden="true">◇</span>
          <div>
            <b>Supporting files</b>
            <span className="opt"> optional</span>
            <p className="ev-sub">
              Slides, one-pagers, dashboards, result exports. Up to {MAX_FILES} files,
              {" "}{humanSize(MAX_FILE_BYTES)} each.
            </p>
          </div>
        </div>

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
          className="dropzone slim"
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
                  <b>{f.name}</b>
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
