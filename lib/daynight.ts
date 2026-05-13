// Maps a local hour into a 0..1 "sky brightness" plus a sun position. Strictly brand
// monochrome: brightness varies, hue does not. Computed in the user's local timezone
// because we use new Date() with no tz hint.

export interface SkyState {
  /** 0 = deep night, 1 = midday */
  brightness: number;
  /** Sun direction (normalized); used for the directional light. */
  sunDir: [number, number, number];
  /** Hemisphere intensity. */
  hemisphereIntensity: number;
  /** Directional light intensity. */
  directionalIntensity: number;
  /** Background tint multiplier applied to BRAND_INK. */
  bgTint: number;
  /** Label for the SyncBadge/InfoBanner. */
  label: string;
}

/** Computes a snapshot for the current Date in the user's local time. */
export function currentSkyState(now: Date = new Date()): SkyState {
  // Continuous hour [0, 24) — interpolates within hours.
  const h = now.getHours() + now.getMinutes() / 60;

  // Brightness curve: smooth ramp from 0 around night, 1 around noon.
  // Use a cosine-shaped day window centred at 13:00, span ±7h with smooth shoulders.
  const dayCenter = 13;
  const halfSpan = 7;
  const x = (h - dayCenter) / halfSpan; // -1 at 06:00, +1 at 20:00
  let brightness = 0;
  if (x > -1.05 && x < 1.05) {
    // Smoothstep eased
    const t = 1 - Math.min(1, Math.abs(x));
    brightness = t * t * (3 - 2 * t);
  }

  // Sun arc: rotate around the X-axis from sunrise (~06) to sunset (~20).
  const sunPhase = ((h - 6) / 14) * Math.PI; // 0 at sunrise, π at sunset
  const sunVisible = sunPhase >= 0 && sunPhase <= Math.PI;
  const sunY = sunVisible ? Math.sin(sunPhase) : -0.4; // below horizon at night
  const sunZ = sunVisible ? Math.cos(sunPhase) : 0.6;
  const sunDir: [number, number, number] = [0.3, sunY, sunZ];

  const label =
    h < 5
      ? "NIGHT"
      : h < 7
        ? "DAWN"
        : h < 11
          ? "MORNING"
          : h < 15
            ? "MIDDAY"
            : h < 18
              ? "AFTERNOON"
              : h < 20
                ? "DUSK"
                : "NIGHT";

  return {
    brightness,
    sunDir,
    hemisphereIntensity: 0.35 + brightness * 0.55,
    directionalIntensity: 0.4 + brightness * 1.1,
    bgTint: 1.0 + brightness * 1.6, // multiplies brand-ink toward brand-on
    label,
  };
}
