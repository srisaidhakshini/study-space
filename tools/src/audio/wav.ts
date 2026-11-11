import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Encodes mono samples (-1..1) as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2;
  const out = Buffer.alloc(44 + dataBytes);
  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(36 + dataBytes, 4);
  out.write('WAVE', 8, 'ascii');
  out.write('fmt ', 12, 'ascii');
  out.writeUInt32LE(16, 16); // PCM header size
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(1, 22); // mono
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28); // byte rate
  out.writeUInt16LE(2, 32); // block align
  out.writeUInt16LE(16, 34); // bits per sample
  out.write('data', 36, 'ascii');
  out.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]!));
    out.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return out;
}

export function writeWav(path: string, samples: Float32Array, sampleRate: number): number {
  mkdirSync(dirname(path), { recursive: true });
  const bytes = encodeWav(samples, sampleRate);
  writeFileSync(path, bytes);
  return bytes.length;
}
