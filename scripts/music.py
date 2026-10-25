#!/usr/bin/env python3
"""Original synthesized score (numpy/scipy) -> build/audio/music.wav (48 kHz stereo, 480 s). No samples, no licensing issues.
Cues follow the film: calm pads, a heartbeat in the core, shimmer arpeggios in the fusion chapter, a riser into core
collapse, a deep boom on the supernova at 445.6 s, and a warm resolve for the finale."""
import numpy as np, wave
from scipy import signal
from pathlib import Path

SR = 48000; DUR = 480.0; N = int(SR * DUR)
rng = np.random.default_rng(7)
t = np.arange(N, dtype=np.float32) / SR
L = np.zeros(N, np.float32); R = np.zeros(N, np.float32)

def env(a, b, fade=3.0):
    e = np.clip((t - a) / fade, 0, 1) * np.clip((b - t) / fade, 0, 1)
    return (e * e * (3 - 2 * e)).astype(np.float32)

def hz(note): return 440.0 * 2 ** ((note - 69) / 12)

# --- pads: one chord per chapter (MIDI notes) ---
CH = [
  (0, 24, [45, 52, 57, 60]), (24, 64, [43, 50, 55, 62]), (64, 112, [45, 52, 57, 64]), (112, 172, [41, 48, 53, 60]),
  (172, 190, [46, 53, 58, 65]), (190, 250, [43, 50, 55, 59]), (250, 285, [38, 45, 50, 57]), (285, 345, [40, 47, 52, 59]),
  (345, 385, [45, 52, 57, 60]), (385, 425, [38, 45, 50, 53]), (425, 446, [35, 42, 47, 50]), (446, 480, [45, 52, 57, 64]),
]
for a, b, notes in CH:
    i0 = max(0, int((a - 4) * SR)); i1 = min(N, int((b + 4) * SR))
    ts = t[i0:i1]
    e = (np.clip((ts - a) / 4.0, 0, 1) * np.clip((b - ts) / 4.0, 0, 1)).astype(np.float32)
    e = e * e * (3 - 2 * e)
    for k, n in enumerate(notes):
        for det, pan in ((-0.07, -0.5), (0.0, 0.0), (0.07, 0.5)):
            f = hz(n) * 2 ** (det / 12)
            ph = rng.uniform(0, 6.28)
            lfo = 0.3 * np.sin(2 * np.pi * 0.07 * ts + k)
            tone = sum(np.sin(2 * np.pi * f * h * ts + ph * h + lfo) / (h ** 1.7) for h in range(1, 4))
            g = 0.05 * e * (0.7 + 0.3 * np.sin(2 * np.pi * (0.03 + 0.01 * k) * ts + ph))
            L[i0:i1] += (tone * g * (1 - 0.5 * pan)).astype(np.float32); R[i0:i1] += (tone * g * (1 + 0.5 * pan)).astype(np.float32)

# --- sub heartbeat in the core (250-345) ---
def thump(at, f0=62, amp=0.30, dur=0.55):
    i0 = int(at * SR); n = int(dur * SR)
    if i0 + n > N: return
    tt = np.arange(n) / SR
    s = np.sin(2 * np.pi * (f0 + 40 * np.exp(-tt * 18)) * tt) * np.exp(-tt * 7.5) * amp
    L[i0:i0 + n] += s.astype(np.float32); R[i0:i0 + n] += s.astype(np.float32)
for at in np.arange(250.5, 345, 1.05 - 0.00 * 1): thump(at, amp=0.18 + 0.12 * np.sin((at - 250) / 95 * np.pi))

# --- shimmer arpeggio during fusion + balance chapters (A minor pentatonic) ---
scale = [57, 60, 62, 64, 67, 69, 72, 74, 76]
def pluck(at, note, amp=0.05):
    i0 = int(at * SR); n = int(1.6 * SR)
    if i0 + n > N: return
    tt = np.arange(n) / SR
    f = hz(note)
    s = (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * 2 * f * tt)) * np.exp(-tt * 3.2) * amp
    pan = rng.uniform(-0.8, 0.8)
    L[i0:i0 + n] += (s * (1 - 0.5 * pan)).astype(np.float32); R[i0:i0 + n] += (s * (1 + 0.5 * pan)).astype(np.float32)
for at in np.arange(285.5, 385, 0.5):
    if rng.random() < 0.7: pluck(at, scale[rng.integers(0, len(scale))] + (12 if at > 345 else 0))
for at in np.arange(24, 64, 1.0):
    if rng.random() < 0.35: pluck(at, scale[rng.integers(2, len(scale))] , amp=0.03)

# --- noise helpers ---
def filt_noise(lo, hi, n):
    x = rng.standard_normal(n).astype(np.float32)
    sos = signal.butter(2, [lo, hi], btype='band', fs=SR, output='sos')
    return signal.sosfilt(sos, x).astype(np.float32)
def whoosh(at, dur=3.0, amp=0.25, up=True):
    i0 = int(at * SR); n = int(dur * SR); n = min(n, N - i0)
    nz = filt_noise(300, 5000, n)
    tt = np.linspace(0, 1, n, dtype=np.float32)
    e = (np.sin(np.pi * tt) ** 2) * (tt if up else 1 - tt + 0.15)
    s = nz * e * amp
    L[i0:i0 + n] += s; R[i0:i0 + n] += s[::-1]
whoosh(100.5, 3.5, 0.30); whoosh(284.0, 2.4, 0.30); whoosh(384.0, 2.2, 0.22)

# --- riser into the collapse (425-445.6) ---
i0, i1 = int(425 * SR), int(445.6 * SR); n = i1 - i0
tt = np.linspace(0, 1, n, dtype=np.float32)
f = 80 * 2 ** (tt * 3.6)
ph = 2 * np.pi * np.cumsum(f) / SR
riser = (np.sin(ph) + 0.5 * np.sin(2 * ph)) * (tt ** 2.2) * 0.12
riser += filt_noise(500, 9000, n) * (tt ** 3) * 0.16
L[i0:i1] += riser; R[i0:i1] += riser
# heartbeat accelerating
at = 427.0; gap = 1.0
while at < 445.4:
    thump(at, f0=48, amp=0.22 + 0.2 * (at - 427) / 18); at += gap; gap = max(0.18, gap * 0.93)

# --- supernova boom at 445.6 ---
i0 = int(445.6 * SR); n = int(7 * SR); tt = np.arange(n) / SR
boom = np.sin(2 * np.pi * (34 + 60 * np.exp(-tt * 3)) * tt) * np.exp(-tt * 0.9) * 0.9
boom += filt_noise(40, 2500, n) * np.exp(-tt * 1.6) * 0.65
L[i0:i0 + n] += boom; R[i0:i0 + n] += boom
# a brief silence before the boom (dip) for impact
dip = 1 - 0.85 * np.exp(-((t - 445.3) / 0.22) ** 2)
L *= dip; R *= dip
# choir-like resolve over the finale
j0 = int(450 * SR); tj = t[j0:]
for n_, g_ in ((57, 0.05), (64, 0.045), (69, 0.04), (72, 0.03)):
    e = np.clip((tj - 450) / 6.0, 0, 1) * np.clip((DUR - tj) / 6.0, 0, 1)
    s_ = np.sin(2 * np.pi * hz(n_) * tj) * e * g_
    L[j0:] += s_.astype(np.float32); R[j0:] += s_.astype(np.float32)

# --- master: gentle reverb-like diffusion, fades, limiter ---
def diffuse(x):
    out = x.copy()
    for d, g in ((0.037, 0.35), (0.071, 0.28), (0.113, 0.2), (0.173, 0.12)):
        k = int(d * SR); out[k:] += x[:-k] * g
    return out
L, R = diffuse(L), diffuse(R)
fade = np.clip(t / 2.5, 0, 1) * np.clip((DUR - t) / 3.0, 0, 1)
L *= fade; R *= fade
pk = max(np.abs(L).max(), np.abs(R).max()); L, R = L / pk * 0.85, R / pk * 0.85
pcm = (np.stack([L, R], 1) * 32767).astype('<i2')
Path('build/audio').mkdir(parents=True, exist_ok=True)
with wave.open('build/audio/music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('music.wav written', pcm.shape)
