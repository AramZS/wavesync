// Unit tests for the ReccoBeats client + analysis synthesizer
// (src/wavesync/reccobeats.js).

import {
  buildSearchText,
  resolveTrackId,
  fetchAudioFeatures,
  buildAnalysisFromFeatures,
  getTrackData
} from '@/wavesync/reccobeats'

const originalFetch = global.fetch

function mockFetchJson (bodyByUrl) {
  global.fetch = jest.fn((url) => {
    const entry = bodyByUrl(url)
    if (!entry) {
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) })
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => entry })
  })
}

afterEach(() => {
  global.fetch = originalFetch
  jest.restoreAllMocks()
})

describe('buildSearchText', () => {
  it('uses the track title only (no artist)', () => {
    expect(buildSearchText('Bohemian Rhapsody')).toBe('Bohemian Rhapsody')
  })
  it('trims surrounding whitespace', () => {
    expect(buildSearchText('  Title  ')).toBe('Title')
  })
  it('handles a missing title', () => {
    expect(buildSearchText(undefined)).toBe('')
  })
})

describe('resolveTrackId', () => {
  it('prefers the ISRC-matching result over content[0]', async () => {
    mockFetchJson((url) => {
      if (url.includes('/track/search')) {
        return {
          content: [
            { id: 'first', isrc: 'AAA111' },
            { id: 'isrc-match', isrc: 'ZZZ999' }
          ]
        }
      }
      return null
    })
    const id = await resolveTrackId({ name: 'Song', isrc: 'zzz999' })
    expect(id).toBe('isrc-match')
  })

  it('prefers an ISRC match over an artist match', async () => {
    mockFetchJson((url) => url.includes('/track/search')
      ? {
          content: [
            { id: 'artist-match', isrc: 'AAA111', artists: [{ name: 'Queen' }] },
            { id: 'isrc-match', isrc: 'ZZZ999', artists: [{ name: 'Someone Else' }] }
          ]
        }
      : null)
    const id = await resolveTrackId({ name: 'Song', artist: 'Queen', isrc: 'zzz999' })
    expect(id).toBe('isrc-match')
  })

  it('uses the artist match when there is no ISRC match', async () => {
    mockFetchJson((url) => url.includes('/track/search')
      ? {
          content: [
            { id: 'wrong-artist', isrc: 'AAA111', artists: [{ name: 'Cover Band' }] },
            { id: 'right-artist', isrc: 'BBB222', artists: [{ name: 'Queen' }] }
          ]
        }
      : null)
    // Case-insensitive artist match; no ISRC provided.
    const id = await resolveTrackId({ name: 'Song', artist: 'queen' })
    expect(id).toBe('right-artist')
  })

  it('falls back to content[0] when neither ISRC nor artist match', async () => {
    mockFetchJson((url) => url.includes('/track/search')
      ? {
          content: [
            { id: 'first', isrc: 'AAA111', artists: [{ name: 'Cover Band' }] },
            { id: 'second', isrc: 'BBB222', artists: [{ name: 'Tribute Act' }] }
          ]
        }
      : null)
    const id = await resolveTrackId({ name: 'Song', artist: 'Queen', isrc: 'NOPE' })
    expect(id).toBe('first')
  })

  it('falls back to content[0] when no artist is supplied', async () => {
    mockFetchJson((url) => url.includes('/track/search')
      ? { content: [{ id: 'first', isrc: 'AAA111' }, { id: 'second', isrc: 'BBB222' }] }
      : null)
    const id = await resolveTrackId({ name: 'Song' })
    expect(id).toBe('first')
  })

  it('returns null on empty content', async () => {
    mockFetchJson((url) => url.includes('/track/search') ? { content: [] } : null)
    const id = await resolveTrackId({ name: 'Song' })
    expect(id).toBeNull()
  })

  it('searches by title only and encodes the query', async () => {
    mockFetchJson(() => ({ content: [{ id: 'x' }] }))
    await resolveTrackId({ name: 'A & B', isrc: 'X' })
    const calledUrl = global.fetch.mock.calls[0][0]
    expect(calledUrl).toContain('searchText=')
    // Only the title is encoded into the query; the artist is never included.
    expect(calledUrl).toContain('searchText=' + encodeURIComponent('A & B'))
    // The raw (unencoded) title must not leak into the URL, and no artist is appended.
    expect(calledUrl).not.toContain('A & B')
  })
})

describe('fetchAudioFeatures', () => {
  it('requests the features endpoint for the recco id', async () => {
    mockFetchJson(() => ({ tempo: 120, energy: 0.5 }))
    const f = await fetchAudioFeatures('recco123')
    expect(f.tempo).toBe(120)
    expect(global.fetch.mock.calls[0][0]).toContain('/track/recco123/audio-features')
  })
})

describe('buildAnalysisFromFeatures', () => {
  const durationMs = 60000 // 60s

  it('produces all five interval types as non-empty arrays', () => {
    const a = buildAnalysisFromFeatures({ tempo: 120, energy: 0.5, loudness: -10 }, durationMs)
    for (const t of ['tatums', 'segments', 'beats', 'bars', 'sections']) {
      expect(Array.isArray(a[t])).toBe(true)
      expect(a[t].length).toBeGreaterThan(0)
    }
  })

  it('spaces beats by 60/tempo seconds', () => {
    const a = buildAnalysisFromFeatures({ tempo: 120 }, durationMs) // 0.5s per beat
    expect(a.beats[0].start).toBe(0)
    expect(a.beats[1].start).toBeCloseTo(0.5, 5)
    // 60s / 0.5s = 120 beats
    expect(a.beats.length).toBe(120)
  })

  it('every interval has start and duration', () => {
    const a = buildAnalysisFromFeatures({ tempo: 90 }, durationMs)
    for (const t of ['tatums', 'segments', 'beats', 'bars', 'sections']) {
      for (const iv of a[t]) {
        expect(typeof iv.start).toBe('number')
        expect(typeof iv.duration).toBe('number')
        expect(iv.duration).toBeGreaterThan(0)
      }
    }
  })

  it('segments carry loudness_start/loudness_max/loudness_max_time in valid ranges', () => {
    const a = buildAnalysisFromFeatures({ tempo: 120, energy: 0.8, loudness: -8 }, durationMs)
    for (const seg of a.segments) {
      expect(seg.loudness_start).toBeGreaterThanOrEqual(-60)
      expect(seg.loudness_start).toBeLessThanOrEqual(0)
      expect(seg.loudness_max).toBeGreaterThanOrEqual(-60)
      expect(seg.loudness_max).toBeLessThanOrEqual(0)
      expect(seg.loudness_max_time).toBeGreaterThanOrEqual(0)
      expect(seg.loudness_max_time).toBeLessThanOrEqual(seg.duration)
    }
  })

  it('guards against absent/absurd tempo (defaults to 120)', () => {
    const a = buildAnalysisFromFeatures({}, durationMs)
    expect(a.beats[1].start).toBeCloseTo(0.5, 5) // 120bpm default
  })

  it('covers the whole track duration', () => {
    const a = buildAnalysisFromFeatures({ tempo: 100 }, durationMs)
    const last = a.beats[a.beats.length - 1]
    expect(last.start + last.duration).toBeCloseTo(60, 5)
  })
})

describe('getTrackData', () => {
  it('resolves, fetches features, and returns analysis + features', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('/track/search')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ content: [{ id: 'rid', isrc: 'X' }] }) })
      }
      if (url.includes('/audio-features')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ tempo: 128, energy: 0.6, loudness: -9 }) })
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) })
    })
    const result = await getTrackData({ name: 'S', isrc: 'X', durationMs: 30000 })
    expect(result).not.toBeNull()
    expect(result.features.tempo).toBe(128)
    expect(result.analysis.beats.length).toBeGreaterThan(0)
  })

  it('returns null when the track is not found', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ content: [] }) }))
    const result = await getTrackData({ name: 'S', durationMs: 30000 })
    expect(result).toBeNull()
  })
})
