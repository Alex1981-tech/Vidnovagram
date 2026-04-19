// AudioWorklet: jitter-buffered playback. Main thread posts decoded Float32
// chunks through `port.postMessage({type:'push', pcm})`; the processor drains
// them into the output buffer. `port.postMessage({type:'clear'})` resets.
const INITIAL_JITTER_CHUNKS = 3;

class VoipPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.offset = 0;
    this.ready = false;
    this.port.onmessage = (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'push' && msg.pcm instanceof Float32Array) {
        this.queue.push(msg.pcm);
      } else if (msg.type === 'clear') {
        this.queue.length = 0;
        this.offset = 0;
        this.ready = false;
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const channel = output[0];
    channel.fill(0);

    if (!this.ready) {
      if (this.queue.length < INITIAL_JITTER_CHUNKS) return true;
      this.ready = true;
    }

    let writeOffset = 0;
    while (writeOffset < channel.length && this.queue.length > 0) {
      const chunk = this.queue[0];
      const remaining = chunk.length - this.offset;
      const toCopy = Math.min(remaining, channel.length - writeOffset);
      channel.set(chunk.subarray(this.offset, this.offset + toCopy), writeOffset);
      writeOffset += toCopy;
      this.offset += toCopy;
      if (this.offset >= chunk.length) {
        this.queue.shift();
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('voip-playback', VoipPlaybackProcessor);
