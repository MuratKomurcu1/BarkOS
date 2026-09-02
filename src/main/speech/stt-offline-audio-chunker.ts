// Why: offline recognizers decode a whole buffer per call, and ONNX Runtime's
// arena allocations scale with buffer length. Chromium's allocator shim kills
// the entire app on any single allocation >= 2 GiB (#7925), so audio must be
// decoded in bounded chunks regardless of how long dictation runs.
export const OFFLINE_DECODE_CHUNK_SECONDS = 30
export const OFFLINE_WAKE_DECODE_CHUNK_SECONDS = 4
export const OFFLINE_ENDPOINT_TRAILING_SILENCE_SECONDS = 0.8

const ENDPOINT_ANALYSIS_WINDOW_SECONDS = 0.02
const ENDPOINT_PRE_ROLL_SECONDS = 0.2
const ENDPOINT_MIN_SPEECH_SECONDS = 0.12
const ENDPOINT_RMS_THRESHOLD = 0.004

// Why: cutting audio mid-word degrades transcription at chunk boundaries.
// Search the tail of each chunk for its quietest window and split at its
// center, so cuts land on real inter-word pauses whenever one exists. The
// window must be pause-sized (~100ms): shorter windows match momentary
// quiet inside a word (e.g. plosive closures) and cut mid-word.
const SPLIT_SEARCH_SECONDS = 5
const SPLIT_ENERGY_WINDOW_SECONDS = 0.1

export class OfflineAudioChunker {
  private buffered: Float32Array[] = []
  private bufferedSamples = 0
  private preRoll: Float32Array[] = []
  private preRollSamples = 0
  private speechSamples = 0
  private trailingSilenceSamples = 0
  private readonly chunkSampleLimit: number
  private readonly splitSearchSamples: number
  private readonly energyWindowSamples: number
  private readonly endpointing: boolean
  private readonly endpointWindowSamples: number
  private readonly endpointPreRollSamples: number
  private readonly endpointMinSpeechSamples: number
  private readonly endpointTrailingSilenceSamples: number

  constructor(
    sampleRate: number,
    options: { endpointing?: boolean; maxChunkSeconds?: number } = {}
  ) {
    const chunkSeconds = options.maxChunkSeconds ?? OFFLINE_DECODE_CHUNK_SECONDS
    this.chunkSampleLimit = Math.max(1, Math.round(chunkSeconds * sampleRate))
    this.splitSearchSamples = Math.min(
      Math.round(SPLIT_SEARCH_SECONDS * sampleRate),
      Math.round(this.chunkSampleLimit / 4)
    )
    this.energyWindowSamples = Math.max(1, Math.round(SPLIT_ENERGY_WINDOW_SECONDS * sampleRate))
    this.endpointing = options.endpointing === true
    this.endpointWindowSamples = Math.max(
      1,
      Math.round(ENDPOINT_ANALYSIS_WINDOW_SECONDS * sampleRate)
    )
    this.endpointPreRollSamples = Math.max(1, Math.round(ENDPOINT_PRE_ROLL_SECONDS * sampleRate))
    this.endpointMinSpeechSamples = Math.max(
      1,
      Math.round(ENDPOINT_MIN_SPEECH_SECONDS * sampleRate)
    )
    this.endpointTrailingSilenceSamples = Math.max(
      1,
      Math.round(OFFLINE_ENDPOINT_TRAILING_SILENCE_SECONDS * sampleRate)
    )
  }

  /** Buffers samples and returns any full chunks now ready to decode. */
  push(samples: Float32Array): Float32Array[] {
    if (samples.length === 0) {
      return []
    }
    if (this.endpointing) {
      return this.pushWithEndpointing(samples)
    }
    this.appendBuffered(samples)
    return this.drainFullChunks()
  }

  private pushWithEndpointing(samples: Float32Array): Float32Array[] {
    const ready: Float32Array[] = []
    for (let offset = 0; offset < samples.length; offset += this.endpointWindowSamples) {
      const frame = samples.slice(
        offset,
        Math.min(samples.length, offset + this.endpointWindowSamples)
      )
      const active = this.frameRms(frame) >= ENDPOINT_RMS_THRESHOLD

      if (this.speechSamples === 0 && !active) {
        this.appendPreRoll(frame)
        continue
      }
      if (this.speechSamples === 0) {
        this.flushPreRollIntoBuffer()
      }

      this.appendBuffered(frame)
      if (active) {
        this.speechSamples += frame.length
        this.trailingSilenceSamples = 0
      } else {
        this.trailingSilenceSamples += frame.length
      }

      ready.push(...this.drainFullChunks())
      if (
        this.speechSamples >= this.endpointMinSpeechSamples &&
        this.trailingSilenceSamples >= this.endpointTrailingSilenceSamples
      ) {
        const utterance = this.flushBuffered()
        if (utterance) {
          ready.push(utterance)
        }
        this.resetEndpointState()
      }
    }
    return ready
  }

  private appendBuffered(samples: Float32Array): void {
    this.buffered.push(samples)
    this.bufferedSamples += samples.length
  }

  private drainFullChunks(): Float32Array[] {
    const ready: Float32Array[] = []
    while (this.bufferedSamples >= this.chunkSampleLimit) {
      const combined = this.combineBuffered()
      const splitIndex = this.findQuietSplitIndex(combined)
      ready.push(combined.slice(0, splitIndex))
      const tail = combined.slice(splitIndex)
      this.buffered = tail.length > 0 ? [tail] : []
      this.bufferedSamples = tail.length
    }
    return ready
  }

  /** Returns all remaining buffered audio (any length below the chunk limit). */
  flush(): Float32Array | null {
    const combined = this.flushBuffered()
    this.preRoll = []
    this.preRollSamples = 0
    this.resetEndpointState()
    return combined
  }

  private flushBuffered(): Float32Array | null {
    if (this.bufferedSamples === 0) {
      return null
    }
    const combined = this.combineBuffered()
    this.buffered = []
    this.bufferedSamples = 0
    return combined
  }

  private appendPreRoll(samples: Float32Array): void {
    this.preRoll.push(samples)
    this.preRollSamples += samples.length
    while (this.preRollSamples > this.endpointPreRollSamples && this.preRoll.length > 0) {
      const excess = this.preRollSamples - this.endpointPreRollSamples
      const first = this.preRoll[0]
      if (first.length <= excess) {
        this.preRoll.shift()
        this.preRollSamples -= first.length
      } else {
        this.preRoll[0] = first.slice(excess)
        this.preRollSamples -= excess
      }
    }
  }

  private flushPreRollIntoBuffer(): void {
    for (const chunk of this.preRoll) {
      this.appendBuffered(chunk)
    }
    this.preRoll = []
    this.preRollSamples = 0
  }

  private resetEndpointState(): void {
    this.speechSamples = 0
    this.trailingSilenceSamples = 0
  }

  private frameRms(samples: Float32Array): number {
    let energy = 0
    for (const sample of samples) {
      energy += sample * sample
    }
    return Math.sqrt(energy / Math.max(1, samples.length))
  }

  private combineBuffered(): Float32Array {
    if (this.buffered.length === 1) {
      return this.buffered[0]
    }
    const combined = new Float32Array(this.bufferedSamples)
    let offset = 0
    for (const chunk of this.buffered) {
      combined.set(chunk, offset)
      offset += chunk.length
    }
    return combined
  }

  private findQuietSplitIndex(samples: Float32Array): number {
    const limit = Math.min(this.chunkSampleLimit, samples.length)
    const window = this.energyWindowSamples
    const searchStart = Math.max(0, limit - this.splitSearchSamples)
    const hop = Math.max(1, Math.floor(window / 2))
    let bestIndex = limit
    let bestEnergy = Infinity
    for (let start = searchStart; start + window <= limit; start += hop) {
      let energy = 0
      for (let i = start; i < start + window; i += 1) {
        energy += samples[i] * samples[i]
      }
      if (energy < bestEnergy) {
        bestEnergy = energy
        bestIndex = start + Math.floor(window / 2)
      }
    }
    // Why: the split must consume at least one sample or push() would loop forever.
    return Math.max(1, bestIndex)
  }
}
