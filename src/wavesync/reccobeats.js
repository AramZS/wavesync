// src/wavesync/reccobeats.js
//
// ReccoBeats client + audio-analysis synthesizer.
//
// Spotify removed the `audio-features` and `audio-analysis` Web API endpoints
// for non-grandfathered apps on 2024-11-27, so WaveSync sources audio features
// from ReccoBeats (https://reccobeats.com) instead. ReccoBeats only exposes
// aggregate audio *features* (tempo, energy, loudness, ...) — there is no
// per-interval analysis timeline — so we synthesize the beats/bars/tatums/
// sections/segments timeline the Visualizer needs from tempo + duration, and
// drive segment loudness from the aggregate energy/loudness values.
//
// Resolution flow (ReccoBeats has no direct Spotify-ID lookup):
//   1. GET /v1/track/search?searchText="<title> <artist>"  -> ReccoBeats id
//   2. GET /v1/track/{reccoId}/audio-features               -> features
//   3. synthesize analysis from features + durationMs
//
// ReccoBeats is keyless and CORS-enabled, so these calls run from the browser.

const RECCOBEATS_BASE = 'https://api.reccobeats.com/v1'

/**
 * Perform a JSON GET with a bounded timeout. Resolves to the parsed body, or
 * rejects on non-2xx / network error / timeout. Uses fetch + AbortController
 * (available in the browser and jsdom test env).
 * @param {string} url
 * @param {number} [timeoutMs=10000]
 * @returns {Promise<any>}
 */
async function getJson (url, timeoutMs = 10000) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  let timer = null
  if (controller && typeof timeoutMs === 'number') {
    timer = setTimeout(() => controller.abort(), timeoutMs)
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller ? controller.signal : undefined
    })
    if (!res.ok) {
      throw new Error('ReccoBeats request failed with status ' + res.status)
    }
    return await res.json()
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Build the search query string from a track title and primary artist.
 * @param {string} name
 * @param {string} artist
 * @returns {string}
 */
export function buildSearchText (name, artist) {
  return [name, artist].filter(Boolean).join(' ').trim()
}

/**
 * Resolve a ReccoBeats track id for a Spotify track.
 *
 * Searches by "<title> <artist>" and prefers the result whose ISRC matches the
 * Spotify track's ISRC; otherwise falls back to the first result.
 *
 * @param {{ name: string, artist: string, isrc?: string }} params
 * @returns {Promise<string|null>} the ReccoBeats id, or null when not found
 */
export async function resolveTrackId ({ name, artist, isrc }) {
  const searchText = buildSearchText(name, artist)
  if (!searchText) return null

  const url = RECCOBEATS_BASE + '/track/search?searchText=' + encodeURIComponent(searchText)
  const body = await getJson(url)
  const content = (body && Array.isArray(body.content)) ? body.content : []
  if (content.length === 0) return null

  if (isrc) {
    const match = content.find((t) => t && t.isrc && t.isrc.toUpperCase() === isrc.toUpperCase())
    if (match && match.id) return match.id
  }

  return content[0] && content[0].id ? content[0].id : null
}

/**
 * Fetch ReccoBeats aggregate audio features for a ReccoBeats track id.
 * @param {string} reccoId
 * @returns {Promise<object>} the features object (tempo, energy, loudness, ...)
 */
export function fetchAudioFeatures (reccoId) {
  return getJson(RECCOBEATS_BASE + '/track/' + encodeURIComponent(reccoId) + '/audio-features')
}

/**
 * Clamp a number into [min, max].
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp (value, min, max) {
  return Math.max(min, Math.min(max, value))
}

/**
 * Synthesize an analysis timeline (in SECONDS, like Spotify's audio-analysis)
 * from aggregate features and the track duration.
 *
 * The downstream Sync_Engine (getTrackInfo) converts these to milliseconds and
 * normalizes the first/last interval, so this function mirrors the Spotify
 * audio-analysis contract: each interval has `start` + `duration` in seconds,
 * and `segments` additionally carry `loudness_start` / `loudness_max` /
 * `loudness_max_time` (seconds for the time field, dB for the loudness fields).
 *
 * Beat grid is derived from tempo (BPM); loudness oscillates around the track's
 * aggregate loudness with an amplitude scaled by energy so getVolume() produces
 * motion that tracks the song's intensity.
 *
 * @param {object} features - ReccoBeats audio features
 * @param {number} durationMs - track duration in milliseconds
 * @returns {{ tatums: object[], segments: object[], beats: object[], bars: object[], sections: object[] }}
 */
export function buildAnalysisFromFeatures (features, durationMs) {
  const f = features || {}
  const durationSec = (typeof durationMs === 'number' && durationMs > 0) ? durationMs / 1000 : 180

  // Tempo in BPM -> seconds per beat. Guard against absent/0/absurd tempo.
  const tempo = (typeof f.tempo === 'number' && f.tempo >= 30 && f.tempo <= 300) ? f.tempo : 120
  const secPerBeat = 60 / tempo

  const energy = clamp(typeof f.energy === 'number' ? f.energy : 0.5, 0, 1)
  // Aggregate loudness in dB (typically -60..0). Default to a mid value.
  const baseLoudness = (typeof f.loudness === 'number') ? clamp(f.loudness, -60, 0) : -12
  // Louder dynamic swings for higher-energy tracks.
  const loudnessAmplitude = 4 + (energy * 16)

  // Build an evenly spaced grid of `count` intervals spanning the track.
  const grid = (step) => {
    const intervals = []
    let start = 0
    while (start < durationSec) {
      const duration = Math.min(step, durationSec - start)
      intervals.push({ start, duration })
      start += step
    }
    if (intervals.length === 0) {
      intervals.push({ start: 0, duration: durationSec })
    }
    return intervals
  }

  const beats = grid(secPerBeat)
  const bars = grid(secPerBeat * 4)
  const tatums = grid(secPerBeat / 2)
  const sections = grid(secPerBeat * 16)

  // Segments: roughly twice beat resolution, each carrying a loudness envelope.
  const segStep = secPerBeat / 2
  const segments = grid(segStep).map((seg, i) => {
    // Oscillate loudness around the base using the segment index so adjacent
    // segments differ (gives getVolume() a moving target).
    const phase = Math.sin(i * 0.9)
    const loudnessStart = clamp(baseLoudness - (loudnessAmplitude * 0.5), -60, 0)
    const loudnessMax = clamp(baseLoudness + (loudnessAmplitude * Math.abs(phase)), -60, 0)
    return {
      start: seg.start,
      duration: seg.duration,
      loudness_start: loudnessStart,
      loudness_max: loudnessMax,
      // Time (in seconds) within the segment where peak loudness occurs.
      loudness_max_time: seg.duration * 0.35
    }
  })

  return { tatums, segments, beats, bars, sections }
}

/**
 * Orchestrate the full ReccoBeats lookup for a Spotify track and return the
 * data the Sync_Engine needs: a synthesized `analysis` timeline and the raw
 * `features` object.
 *
 * @param {{ name: string, artist: string, isrc?: string, durationMs: number }} track
 * @returns {Promise<{ analysis: object, features: object }|null>}
 *   null when the track could not be resolved to ReccoBeats features.
 */
export async function getTrackData ({ name, artist, isrc, durationMs }) {
  const reccoId = await resolveTrackId({ name, artist, isrc })
  if (!reccoId) return null

  const features = await fetchAudioFeatures(reccoId)
  if (!features) return null

  const analysis = buildAnalysisFromFeatures(features, durationMs)
  return { analysis, features }
}
