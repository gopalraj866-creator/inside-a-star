#!/usr/bin/env python3
"""Master mix: music (ducked under the voice) + narration -> build/audio/master.wav (+ shorts.wav from the Short's cut list)."""
import json, subprocess, sys
from pathlib import Path
A = Path('build/audio')
has_voice = (A / 'narration.wav').exists()
if has_voice:
    fc = ('[0:a]volume=0.62[m];[1:a]asplit=2[v][k];[m][k]sidechaincompress=threshold=0.02:ratio=9:attack=20:release=500:makeup=1[md];'
          '[md][v]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[out]')
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-i', str(A / 'music.wav'), '-i', str(A / 'narration.wav'), '-filter_complex', fc, '-map', '[out]', '-ar', '48000', '-ac', '2', str(A / 'master.wav')]
else:
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-i', str(A / 'music.wav'), '-af', 'volume=0.8', str(A / 'master.wav')]
subprocess.run(cmd, check=True)
print('master.wav written (voice: %s)' % has_voice)
