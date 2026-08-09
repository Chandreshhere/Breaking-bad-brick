import type { BiomeName } from '../environment/EnvironmentDirector';

/**
 * One track per world. Every world used to share a single 140 BPM trap loop,
 * so six very different arenas sounded identical. A track is pure data — the
 * tempo, the key, which of the 16 steps each voice fires on, and the timbre
 * of each voice — and `MusicEngine` renders it. Nothing here is a sample.
 *
 * Frequencies are in Hz so the tables read as actual pitches rather than
 * MIDI numbers that need converting at schedule time.
 */
export interface MusicTrack {
  /** Shown nowhere; keeps the tables self-documenting. */
  name: string;
  bpm: number;
  /** Bass root per bar, cycled. */
  subNotes: number[];
  /** Notes the melody picks from. */
  pluckScale: number[];
  /** Sustained pad chord. */
  padChord: number[];
  padType: OscillatorType;
  padGain: number;
  /** Which of the 16 steps each voice fires on. */
  kickSteps: number[];
  snareSteps: number[];
  melodySteps: number[];
  stabSteps: number[];
  melodyChance: number;
  hatMode: 'trap' | 'four' | 'offbeat' | 'shaker' | 'none';
  /** Voice colour. */
  kickFrom: number;
  kickTo: number;
  kickDecay: number;
  snareBand: number;
  snareTone: number;
  bassType: OscillatorType;
  /** 808-style pitch dive into the root; off for plucked//synth basses. */
  bassGlide: boolean;
  bassDecay: number;
  pluckType: OscillatorType;
  pluckDecay: number;
  stabType: OscillatorType;
  stabCutoff: number;
  hatHighpass: number;
  /** Fraction of a step that odd steps are pushed late (0 = straight). */
  swing: number;
}

const TRAP: MusicTrack = {
  name: 'NIGHT SESSION — D minor trap',
  bpm: 140,
  subNotes: [36.71, 36.71, 43.65, 32.7], // D1 D1 F1 C1
  pluckScale: [293.66, 349.23, 392.0, 440.0, 523.25], // D4 F4 G4 A4 C5
  padChord: [146.83, 174.61, 220.0], // D3 F3 A3
  padType: 'triangle',
  padGain: 0.035,
  kickSteps: [0, 6, 10],
  snareSteps: [8],
  melodySteps: [2, 7, 12],
  stabSteps: [0, 8],
  melodyChance: 0.75,
  hatMode: 'trap',
  kickFrom: 150,
  kickTo: 48,
  kickDecay: 0.22,
  snareBand: 1800,
  snareTone: 190,
  bassType: 'sine',
  bassGlide: true,
  bassDecay: 0.4,
  pluckType: 'triangle',
  pluckDecay: 0.28,
  stabType: 'sawtooth',
  stabCutoff: 2400,
  hatHighpass: 7000,
  swing: 0.12,
};

/** Driving four-on-the-floor synthwave — cold, relentless, A minor. */
const SYNTHWAVE: MusicTrack = {
  name: 'ELECTRIC RALLY — A minor synthwave',
  bpm: 126,
  subNotes: [55.0, 55.0, 65.41, 49.0], // A1 A1 C2 G1
  pluckScale: [220.0, 261.63, 329.63, 392.0, 440.0], // A3 C4 E4 G4 A4
  padChord: [110.0, 130.81, 164.81], // A2 C3 E3
  padType: 'sawtooth',
  padGain: 0.022, // saws stack louder than triangles
  kickSteps: [0, 4, 8, 12],
  snareSteps: [4, 12],
  melodySteps: [0, 2, 4, 6, 8, 10, 12, 14],
  stabSteps: [0, 6, 8, 14],
  melodyChance: 0.55, // a running arp, not a tune
  hatMode: 'offbeat',
  kickFrom: 190,
  kickTo: 55,
  kickDecay: 0.16,
  snareBand: 2400,
  snareTone: 230,
  bassType: 'sawtooth',
  bassGlide: false, // plucked synth bass, no 808 dive
  bassDecay: 0.22,
  pluckType: 'square',
  pluckDecay: 0.14,
  stabType: 'sawtooth',
  stabCutoff: 3200,
  hatHighpass: 8500,
  swing: 0,
};

/** Half-time industrial doom — slow, enormous, E phrygian. */
const DOOM: MusicTrack = {
  name: 'EMBERS & ASH — E phrygian doom',
  bpm: 92,
  subNotes: [41.2, 41.2, 43.65, 32.7], // E1 E1 F1 C1 — the b2 is the menace
  pluckScale: [329.63, 349.23, 392.0, 493.88, 523.25], // E4 F4 G4 B4 C5
  padChord: [82.41, 98.0, 123.47], // E2 G2 B2
  padType: 'sawtooth',
  padGain: 0.026,
  kickSteps: [0, 7, 8],
  snareSteps: [8],
  melodySteps: [6, 14],
  stabSteps: [0, 4, 8, 12],
  melodyChance: 0.4, // sparse — space is the point
  hatMode: 'none', // no hats; the room is the rhythm
  kickFrom: 120,
  kickTo: 36, // deeper and longer than the trap kick
  kickDecay: 0.42,
  snareBand: 1200,
  snareTone: 130,
  bassType: 'sawtooth',
  bassGlide: true,
  bassDecay: 0.7,
  pluckType: 'sawtooth',
  pluckDecay: 0.5,
  stabType: 'square',
  stabCutoff: 900, // muffled, heavy
  hatHighpass: 6000,
  swing: 0,
};

/** Weightless ambient bells — D major pentatonic, nothing percussive. */
const AMBIENT: MusicTrack = {
  name: 'HOLOGRAPHIC COURT — D pentatonic ambient',
  bpm: 112,
  subNotes: [36.71, 41.2, 49.0, 36.71], // D1 E1 G1 D1
  pluckScale: [587.33, 659.25, 739.99, 880.0, 987.77], // D5 E5 F#5 A5 B5
  padChord: [146.83, 185.0, 220.0], // D3 F#3 A3 — major, not minor
  padType: 'sine',
  padGain: 0.05, // the pad *is* the track here
  kickSteps: [0, 10],
  snareSteps: [8],
  melodySteps: [0, 3, 5, 7, 9, 11, 13, 15],
  stabSteps: [0],
  melodyChance: 0.7,
  hatMode: 'shaker',
  kickFrom: 110,
  kickTo: 45,
  kickDecay: 0.3,
  snareBand: 3200,
  snareTone: 320, // brushed, not cracked
  bassType: 'sine',
  bassGlide: false,
  bassDecay: 0.9,
  pluckType: 'sine', // glass bells
  pluckDecay: 0.75,
  stabType: 'triangle',
  stabCutoff: 1800,
  hatHighpass: 11000,
  swing: 0,
};

/** Chiptune — fast, bright, square-wave C major. */
const CHIPTUNE: MusicTrack = {
  name: 'INSERT COIN — C major chiptune',
  bpm: 150,
  subNotes: [32.7, 32.7, 43.65, 49.0], // C1 C1 F1 G1
  pluckScale: [523.25, 587.33, 659.25, 783.99, 880.0], // C5 D5 E5 G5 A5
  padChord: [130.81, 164.81, 196.0], // C3 E3 G3
  padType: 'square',
  padGain: 0.012, // square pads get harsh fast
  kickSteps: [0, 4, 8, 12],
  snareSteps: [4, 12],
  melodySteps: [0, 1, 2, 3, 4, 6, 8, 9, 10, 11, 12, 14],
  stabSteps: [0, 8],
  melodyChance: 0.85, // busy arpeggio, the lead voice of the world
  hatMode: 'four',
  kickFrom: 160,
  kickTo: 60,
  kickDecay: 0.12,
  snareBand: 3000,
  snareTone: 260,
  bassType: 'square',
  bassGlide: false,
  bassDecay: 0.16,
  pluckType: 'square',
  pluckDecay: 0.1, // short and blippy
  stabType: 'square',
  stabCutoff: 4000,
  hatHighpass: 9000,
  swing: 0,
};

/** Big brassy comic funk — syncopated, punchy, G minor. */
const FUNK: MusicTrack = {
  name: 'BAM! POW! — G minor funk',
  bpm: 132,
  subNotes: [49.0, 49.0, 58.27, 43.65], // G1 G1 Bb1 F1
  pluckScale: [392.0, 466.16, 523.25, 587.33, 698.46], // G4 Bb4 C5 D5 F5
  padChord: [98.0, 116.54, 146.83], // G2 Bb2 D3
  padType: 'sawtooth',
  padGain: 0.02,
  kickSteps: [0, 3, 6, 10, 11],
  snareSteps: [4, 12],
  melodySteps: [2, 5, 9, 13],
  stabSteps: [2, 6, 10, 14], // horn hits on the offbeats
  melodyChance: 0.6,
  hatMode: 'offbeat',
  kickFrom: 170,
  kickTo: 50,
  kickDecay: 0.18,
  snareBand: 2000,
  snareTone: 210,
  bassType: 'triangle',
  bassGlide: false,
  bassDecay: 0.2,
  pluckType: 'sawtooth',
  pluckDecay: 0.2,
  stabType: 'sawtooth',
  stabCutoff: 2800,
  hatHighpass: 7500,
  swing: 0.18, // the shuffle that makes it read as funk
};

export const TRACKS: Record<BiomeName, MusicTrack> = {
  CLAY: TRAP,
  NEON: SYNTHWAVE,
  HELL: DOOM,
  LOTUS_OS: AMBIENT,
  NEON_ARCADE: CHIPTUNE,
  COMIC_IMPACT: FUNK,
};

export const DEFAULT_TRACK = TRAP;
