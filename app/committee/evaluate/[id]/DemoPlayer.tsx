"use client";

import { useState } from "react";
import type { VideoEmbed } from "@/lib/videoEmbed";

export default function DemoPlayer({ demo }: { demo: VideoEmbed }) {
  const [failed, setFailed] = useState(false);
  const showPlayer = !failed && demo.mode !== "link" && !!demo.src;

  return (
    <div className="ev-uploaded" style={{ marginBottom: 14 }}>
      {showPlayer && demo.mode === "video" && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          className="ev-video"
          src={demo.src}
          controls
          preload="metadata"
          onError={() => setFailed(true)}
        />
      )}
      {showPlayer && demo.mode === "iframe" && (
        <iframe
          className="ev-video"
          src={demo.src}
          title="Demo video"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      )}
      {!showPlayer && (
        <div className="ev-noplay">
          <p>This link can&apos;t play inline here.</p>
          <a className="btn sm" href={demo.url} target="_blank" rel="noreferrer">
            Watch the demo ↗
          </a>
        </div>
      )}

      <div className="ev-file-row">
        <span className="muted">
          Demo video{demo.host ? ` · ${demo.host}` : ""}
        </span>
        <a className="btn ghost sm" href={demo.url} target="_blank" rel="noreferrer">
          Open ↗
        </a>
      </div>
    </div>
  );
}
