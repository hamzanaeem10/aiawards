// Turn a shared demo-video link into something playable in the evaluate page.
// Best-effort: OneDrive / SharePoint / Stream / YouTube / Loom / Google Drive /
// a direct file URL all get an inline player; anything else falls back to a
// "open in a new tab" link. The share link must allow "anyone with the link".

export type VideoEmbed = {
  url: string;
  mode: "video" | "iframe" | "link";
  src?: string;
  host: string;
};

function b64url(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function videoEmbed(raw: string): VideoEmbed {
  const url = (raw || "").trim();
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { url, mode: "link", host: "" };
  }
  const host = u.hostname.toLowerCase();

  // OneDrive personal (1drv.ms short links, onedrive.live.com) — the consumer
  // "shares" API redirects an anonymous share link straight to file content.
  if (host === "1drv.ms" || host.endsWith("onedrive.live.com")) {
    return {
      url,
      host,
      mode: "video",
      src: `https://api.onedrive.com/v1.0/shares/u!${b64url(url)}/root/content`,
    };
  }

  // OneDrive for Business / SharePoint
  if (host.endsWith("sharepoint.com")) {
    // A real embed URL from SharePoint's Share → "Embed" dialog — frame as-is.
    if (/\/embed\.aspx/i.test(u.pathname) || u.searchParams.has("action")) {
      return { url, host, mode: "iframe", src: url };
    }
    // A :v: / :b: share link. SharePoint blocks cross-origin framing of the
    // share page, so hit the anonymous direct-content form and play that.
    const sep = u.search ? "&" : "?";
    return { url, host, mode: "video", src: `${url}${sep}download=1` };
  }

  // Microsoft Stream
  if (host.includes("microsoftstream.com") || host.includes("stream.office.com")) {
    return {
      url,
      host,
      mode: "iframe",
      src: url.includes("embed") ? url : `${url}${u.search ? "&" : "?"}embed=true`,
    };
  }

  // YouTube (unlisted is fine)
  if (host.endsWith("youtube.com") || host === "youtu.be") {
    const id = host === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v");
    if (id) {
      return { url, host, mode: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}` };
    }
  }

  // Loom
  if (host.endsWith("loom.com")) {
    return { url, host, mode: "iframe", src: url.replace("/share/", "/embed/") };
  }

  // Google Drive
  if (host.endsWith("drive.google.com")) {
    const m = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (m) {
      return { url, host, mode: "iframe", src: `https://drive.google.com/file/d/${m[1]}/preview` };
    }
  }

  // A direct video file
  if (/\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(u.pathname)) {
    return { url, host, mode: "video", src: url };
  }

  return { url, host, mode: "link" };
}
