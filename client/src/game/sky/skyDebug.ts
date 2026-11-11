import type { Weather } from '@study/shared';

/**
 * Developer overrides read once from the page URL, for previewing the sky:
 *
 *   ?map=hub&hour=21.5                  game hour 0-24, frozen
 *   ?map=hub&weather=rain               clear | cloudy | rain, frozen
 *   ?map=hub&weather=rain&intensity=0.8 how heavy (0-1, default 0.8)
 *
 * Without these parameters the sky follows the shared world clock.
 */
export interface SkyDebug {
  hour: number | null;
  weather: Weather | null;
  intensity: number;
}

function parse(): SkyDebug {
  const query = new URLSearchParams(window.location.search);
  const hourText = query.get('hour');
  const hour = hourText === null ? NaN : Number(hourText);
  const weather = query.get('weather');
  const intensityText = query.get('intensity');
  const intensity = intensityText === null ? NaN : Number(intensityText);
  return {
    hour: Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : null,
    weather: weather === 'clear' || weather === 'cloudy' || weather === 'rain' ? weather : null,
    intensity: Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0.8,
  };
}

export const SKY_DEBUG: SkyDebug = parse();
