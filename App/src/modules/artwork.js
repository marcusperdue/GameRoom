const path = require("node:path");

function archiveSearchTerms(game, system = {}) {
  return [
    `"${escapeArchiveQuery(game.title)}"`,
    "AND",
    `(${escapeArchiveQuery(game.system)} OR ${escapeArchiveQuery(system.emulator || "")} OR cover OR box OR artwork OR manual)`
  ].join(" ");
}

function escapeArchiveQuery(value) {
  return String(value || "").replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
}

function plainText(value) {
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);
}

function extractWrappedImageUrl(parsedUrl) {
  const params = ["imgurl", "mediaurl", "image_url", "image", "url", "u"];
  for (const param of params) {
    const value = parsedUrl.searchParams.get(param);
    if (!value) continue;
    try {
      const nested = new URL(value);
      if (["http:", "https:"].includes(nested.protocol)) return nested.toString();
    } catch {
      // Keep checking other wrapper params.
    }
  }
  return "";
}

function extractImageUrlFromHtml(html, baseUrl) {
  const patterns = [
    /<meta\s+[^>]*(?:property|name)=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image(?::secure_url)?["'][^>]*>/i,
    /<meta\s+[^>]*(?:property|name)=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<link\s+[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["'][^>]*>/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;
    try {
      const imageUrl = new URL(decodeHtmlEntities(match[1]), baseUrl);
      if (["http:", "https:"].includes(imageUrl.protocol)) return imageUrl.toString();
    } catch {
      // Try the next metadata format.
    }
  }

  return "";
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extensionForContentType(contentType) {
  const type = contentType.toLowerCase().split(";")[0].trim();
  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif"
  };
  return map[type] || "";
}

function extensionForUrl(parsedUrl, coverExtensions) {
  const ext = path.extname(parsedUrl.pathname).toLowerCase().replace(".", "");
  return coverExtensions.includes(ext) ? (ext === "jpeg" ? "jpg" : ext) : "";
}

function extensionForBytes(bytes) {
  if (!bytes || bytes.length < 12) return "";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.slice(0, 6).toString("ascii") === "GIF87a" || bytes.slice(0, 6).toString("ascii") === "GIF89a") return "gif";
  if (bytes.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  if (bytes.slice(4, 12).toString("ascii").includes("ftypavif")) return "avif";
  return "";
}

module.exports = {
  archiveSearchTerms,
  decodeHtmlEntities,
  escapeArchiveQuery,
  extensionForBytes,
  extensionForContentType,
  extensionForUrl,
  extractImageUrlFromHtml,
  extractWrappedImageUrl,
  plainText
};
