// AudioWorklet: mic capture. Runs on audio render thread, posts per-quantum
// Float32 PCM back to the main thread which handles encoding + WebSocket send.
class VoipCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel || channel.length === 0) return true;
    // Transfer a copy — the underlying buffer gets reused on the next quantum.
    const copy = new Float32Array(channel.length);
    copy.set(channel);
    this.port.postMessage(copy, [copy.buffer]);
    return true;
  }
}

registerProcessor('voip-capture', VoipCaptureProcessor);
