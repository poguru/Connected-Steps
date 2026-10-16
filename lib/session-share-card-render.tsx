/**
 * The layouts for a session's share image: an Instagram Story (1080 x 1920) and a WhatsApp image (1080 x 1350).
 * Rendered by Next's image generator in the route; this module only builds the element tree.
 *
 * Rules: the logo is shown whole and never cropped; the session photo is used only when the session has one; a
 * missing detail is left out; the top and bottom of a story are kept clear of the app's own controls.
 */

import type { CardModel, ShareFormat } from "@/lib/session-share-card";
import { SHARE_FORMAT_SIZE, titleFontSize } from "@/lib/session-share-card";

const BLACK = "#111111";
const ORANGE = "#F97316";
const WHITE = "#FFFFFF";
const GREY = "#B3B3B3";
/** The brand heading font, bundled in public/fonts (SIL Open Font License) and passed to the image generator */
export const BRAND_FONT = "Barlow Condensed";

export interface ShareCardAssets {
  model: CardModel;
  logoDataUrl: string | null;
  photoDataUrl: string | null;
  /** The join link. Shown on the WhatsApp image, where it can be copied. */
  joinUrl: string;
  tagline: string;
}

interface Row { label: string; value: string }

function detailRows(model: CardModel): Row[] {
  const rows: Row[] = [];
  if (model.dateLabel) rows.push({ label: "Date", value: model.dateLabel });
  if (model.timeLabel) rows.push({ label: "Time", value: model.timeLabel });
  if (model.venueLabel) rows.push({ label: "Venue", value: model.venueLabel });
  return rows;
}

function Background({ photoDataUrl, width, height }: { photoDataUrl: string | null; width: number; height: number }) {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, width, height, display: "flex", background: BLACK }}>
      {photoDataUrl && (
        <img src={photoDataUrl} width={width} height={height} style={{ position: "absolute", top: 0, left: 0, width, height, objectFit: "cover" }} />
      )}
      {/* Darker at the top and bottom, so the title and the panel read clearly over the photo */}
      <div style={{
        position: "absolute", top: 0, left: 0, width, height, display: "flex",
        backgroundImage: "linear-gradient(180deg, rgba(17,17,17,0.94) 0%, rgba(17,17,17,0.6) 38%, rgba(17,17,17,0.7) 62%, rgba(17,17,17,0.97) 100%)",
      }} />
      {/* A soft orange light behind the title, covering the whole canvas so it has no edge */}
      <div style={{
        position: "absolute", top: 0, left: 0, width, height, display: "flex",
        backgroundImage: `radial-gradient(ellipse ${Math.round(width * 0.8)}px ${Math.round(height * 0.3)}px at 50% ${Math.round(height * 0.3)}px, rgba(249,115,22,0.3) 0%, rgba(249,115,22,0) 100%)`,
      }} />
    </div>
  );
}

function InfoPanel({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return null;
  return (
    <div style={{
      display: "flex", flexDirection: "column", width: "100%",
      background: "rgba(0,0,0,0.62)", border: "2px solid rgba(249,115,22,0.55)", borderRadius: 28, padding: "38px 52px",
    }}>
      {rows.map((row, i) => (
        <div key={row.label} style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: i === 0 ? 0 : 26, paddingBottom: i === rows.length - 1 ? 0 : 26, borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.12)" }}>
          <span style={{ fontSize: 22, color: ORANGE, fontWeight: 800, letterSpacing: 4, textTransform: "uppercase" }}>{row.label}</span>
          <span style={{ fontSize: 42, color: WHITE, fontWeight: 700, lineHeight: 1.15 }}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function Cta({ label, height }: { label: string; height: number }) {
  return (
    <div style={{ display: "flex", width: "100%", height, alignItems: "center", justifyContent: "center", background: ORANGE, borderRadius: 24 }}>
      <span style={{ fontSize: Math.round(height * 0.4), color: WHITE, fontWeight: 900, letterSpacing: 3, textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

function Title({ model, format }: { model: CardModel; format: ShareFormat }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, width: "100%" }}>
      {/* The kicker is left out when it would repeat the title */}
      {model.kicker.toLowerCase() !== model.title.toLowerCase() && (
        <span style={{ fontSize: format === "story" ? 34 : 30, color: ORANGE, fontWeight: 800, letterSpacing: 6, textTransform: "uppercase", textAlign: "center" }}>
          {model.kicker}
        </span>
      )}
      <span style={{ fontSize: titleFontSize(model.title, format), color: WHITE, fontWeight: 900, lineHeight: 1.04, textTransform: "uppercase", textAlign: "center" }}>
        {model.title}
      </span>
      <div style={{ display: "flex", width: 160, height: 6, background: ORANGE, borderRadius: 99 }} />
    </div>
  );
}

function Brand({ logoDataUrl, size, wordSize }: { logoDataUrl: string | null; size: number; wordSize: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      {logoDataUrl && <img src={logoDataUrl} width={size} height={size} style={{ width: size, height: size }} />}
      <span style={{ fontSize: wordSize, color: WHITE, fontWeight: 800, letterSpacing: 8, textTransform: "uppercase" }}>Connected Steps</span>
    </div>
  );
}

/** The 1080 x 1920 story. Top 250px and bottom 330px stay clear of the app's own controls. */
export function StoryCard({ model, logoDataUrl, photoDataUrl, tagline }: ShareCardAssets) {
  const { width, height } = SHARE_FORMAT_SIZE.story;
  return (
    <div style={{ width, height, display: "flex", position: "relative", fontFamily: BRAND_FONT }}>
      <Background photoDataUrl={photoDataUrl} width={width} height={height} />
      <div style={{
        position: "absolute", top: 0, left: 0, width, height, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "space-between", padding: "250px 90px 330px",
      }}>
        <Brand logoDataUrl={logoDataUrl} size={150} wordSize={46} />
        <Title model={model} format="story" />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40, width: "100%" }}>
          <InfoPanel rows={detailRows(model)} />
          <span style={{ fontSize: 34, color: GREY, textAlign: "center" }}>{tagline}</span>
          <Cta label={model.ctaLabel} height={130} />
        </div>
      </div>
    </div>
  );
}

/** The 1080 x 1350 WhatsApp image. The join link is written out, so it can be copied in the chat. */
export function WhatsAppCard({ model, logoDataUrl, photoDataUrl, joinUrl, tagline }: ShareCardAssets) {
  const { width, height } = SHARE_FORMAT_SIZE.whatsapp;
  return (
    <div style={{ width, height, display: "flex", position: "relative", fontFamily: BRAND_FONT }}>
      <Background photoDataUrl={photoDataUrl} width={width} height={height} />
      <div style={{
        position: "absolute", top: 0, left: 0, width, height, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "space-between", padding: "70px 80px 70px",
      }}>
        <Brand logoDataUrl={logoDataUrl} size={120} wordSize={40} />
        <Title model={model} format="whatsapp" />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30, width: "100%" }}>
          <InfoPanel rows={detailRows(model)} />
          <Cta label={model.ctaLabel} height={116} />
          <span style={{ fontSize: 26, color: GREY, textAlign: "center" }}>{tagline}</span>
          <span style={{ fontSize: 24, color: WHITE, textAlign: "center" }}>{joinUrl.replace(/^https?:\/\//, "")}</span>
        </div>
      </div>
    </div>
  );
}

/** The size of the link preview: what WhatsApp and other chats show when the join link is pasted. */
export const LINK_PREVIEW_SIZE = { width: 1200, height: 630 } as const;

/** The 1200 x 630 link preview, in the same style as the story and WhatsApp images. */
export function LinkCard({ model, logoDataUrl, photoDataUrl }: ShareCardAssets) {
  const { width, height } = LINK_PREVIEW_SIZE;
  const details = [model.dateLabel, model.timeLabel, model.venueLabel].filter(Boolean).join("  ·  ");
  return (
    <div style={{ width, height, display: "flex", position: "relative", fontFamily: BRAND_FONT }}>
      <Background photoDataUrl={photoDataUrl} width={width} height={height} />
      <div style={{ position: "absolute", top: 0, left: 0, width, height, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 80px", gap: 48 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, flex: 1, minWidth: 0 }}>
          {model.kicker.toLowerCase() !== model.title.toLowerCase() && (
            <span style={{ fontSize: 26, color: ORANGE, fontWeight: 800, letterSpacing: 5, textTransform: "uppercase" }}>{model.kicker}</span>
          )}
          <span style={{ fontSize: 84, color: WHITE, fontWeight: 900, lineHeight: 1.02, textTransform: "uppercase" }}>{model.title}</span>
          <div style={{ display: "flex", width: 120, height: 6, background: ORANGE, borderRadius: 99 }} />
          {details && <span style={{ fontSize: 30, color: WHITE, fontWeight: 700 }}>{details}</span>}
          <div style={{ display: "flex", marginTop: 8, height: 76, width: 330, alignItems: "center", justifyContent: "center", background: ORANGE, borderRadius: 18 }}>
            <span style={{ fontSize: 30, color: WHITE, fontWeight: 900, letterSpacing: 3, textTransform: "uppercase" }}>{model.ctaLabel}</span>
          </div>
        </div>
        {logoDataUrl && (
          <div style={{ display: "flex", flexShrink: 0 }}>
            <img src={logoDataUrl} width={250} height={250} style={{ width: 250, height: 250 }} />
          </div>
        )}
      </div>
    </div>
  );
}
