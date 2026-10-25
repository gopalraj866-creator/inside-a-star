#!/usr/bin/env python3
"""Narration: one clip per script line -> placed on the 480 s timeline -> build/audio/narration.wav + timing.json.

Voice engines, in order:  edge-tts (neural; en-IN-PrabhatNeural by default)  ->  espeak-ng (offline fallback).
The pipeline never stops because a voice is unavailable: the fallback is robotic but keeps timing/captions valid.
Set VOICE=en-IN-NeerjaNeural (female) or any edge-tts voice name to change it.
"""
import asyncio, json, os, subprocess, sys, shutil, wave
from pathlib import Path

OUT = Path('build/audio'); CLIPS = OUT / 'clips'; CLIPS.mkdir(parents=True, exist_ok=True)
VOICE = os.environ.get('VOICE', 'en-IN-PrabhatNeural')
RATE = os.environ.get('VOICE_RATE', '-3%')
DUR = 480.0
SR = 48000
lines = json.loads((OUT / 'lines.json').read_text())['lines']

def ffprobe_dur(p):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(p)], capture_output=True, text=True)
    return float(r.stdout.strip())

async def edge_one(text, path):
    import edge_tts
    await edge_tts.Communicate(text, VOICE, rate=RATE).save(str(path))

def synth_all():
    engine = None
    try:
        import edge_tts  # noqa
        engine = 'edge'
    except Exception:
        pass
    results = {}
    for L in lines:
        mp3 = CLIPS / f"{L['id']}.mp3"; wav = CLIPS / f"{L['id']}.wav"
        ok = False
        if os.environ.get('TTS_ENGINE') == 'mock':      # test-only: placeholder tone with a realistic duration (NOT the real voice)
            words = len(L['text'].split()); d = max(1.4, words / 2.45 + 0.2)
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', f'sine=f=180:r={SR}:d={d:.3f}', '-af', 'volume=0.06,tremolo=f=4:d=0.8', '-ac', '1', str(wav)], check=True)
            results[L['id']] = True; continue
        if engine == 'edge':
            for attempt in range(3):
                try:
                    asyncio.run(edge_one(L['text'], mp3)); ok = mp3.exists() and mp3.stat().st_size > 800; break
                except Exception as e:
                    print(f"  edge-tts retry {attempt+1} for {L['id']}: {str(e)[:80]}", file=sys.stderr)
            if not ok: engine = None   # network blocked -> switch to the offline fallback for the rest
        if ok:
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(mp3), '-ar', str(SR), '-ac', '1', str(wav)], check=True)
        elif shutil.which('espeak-ng'):
            subprocess.run(['espeak-ng', '-v', 'en-gb', '-s', '150', '-p', '40', '-w', str(wav), L['text']], check=True)
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-ar', str(SR), '-ac', '1', str(wav) + '.tmp.wav'], check=True)
            os.replace(str(wav) + '.tmp.wav', wav)
            ok = True
        results[L['id']] = ok
    return results

def main():
    res = synth_all()
    have = [k for k, v in res.items() if v]
    engine = 'mock' if os.environ.get('TTS_ENGINE') == 'mock' else ('edge-tts' if (CLIPS / (lines[0]['id'] + '.mp3')).exists() else ('espeak-ng' if have else 'none'))
    print(f'voice engine: {engine}; clips ok: {len(have)}/{len(lines)}')
    timing = {}
    prev_end = 0.0
    placed = []
    for i, L in enumerate(lines):
        wav = CLIPS / f"{L['id']}.wav"
        if not wav.exists():
            continue
        d = ffprobe_dur(wav)
        start = max(L['t'], prev_end + 0.12)
        nxt = lines[i + 1]['t'] if i + 1 < len(lines) else DUR
        tempo = 1.0
        if start + d > nxt - 0.10 and d > 0:               # would run into the next line: speed up slightly (max 12 %)
            tempo = min(1.12, d / max(0.5, nxt - 0.10 - start))
            tempo = max(tempo, 1.0)
        if tempo > 1.001:
            t2 = CLIPS / f"{L['id']}.t.wav"
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-filter:a', f'atempo={tempo:.4f}', str(t2)], check=True)
            wav = t2; d = ffprobe_dur(wav)
        timing[L['id']] = {'start': round(start, 3), 'dur': round(d, 3), 'tempo': round(tempo, 3)}
        placed.append((start, wav))
        prev_end = start + d
    # mix onto a silent bed with ffmpeg adelay
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-t', str(DUR), '-i', f'anullsrc=r={SR}:cl=mono']
    for _, w in placed: cmd += ['-i', str(w)]
    parts = []
    for k, (s, _) in enumerate(placed, start=1):
        parts.append(f'[{k}:a]adelay={int(s*1000)}:all=1[a{k}]')
    mixin = '[0:a]' + ''.join(f'[a{k}]' for k in range(1, len(placed) + 1))
    fc = ';'.join(parts) + f';{mixin}amix=inputs={len(placed)+1}:normalize=0:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=9[out]'
    cmd += ['-filter_complex', fc, '-map', '[out]', '-ar', str(SR), '-ac', '1', '-t', str(DUR), str(OUT / 'narration.wav')]
    # very long filter graphs: write to a script file
    script = OUT / 'filter.txt'; script.write_text(fc)
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-t', str(DUR), '-i', f'anullsrc=r={SR}:cl=mono'] + sum([['-i', str(w)] for _, w in placed], []) + ['-filter_complex_script', str(script), '-map', '[out]', '-ar', str(SR), '-ac', '1', '-t', str(DUR), str(OUT / 'narration.wav')]
    subprocess.run(cmd, check=True)
    (OUT / 'timing.json').write_text(json.dumps(timing, indent=1))
    (OUT / 'voice.txt').write_text(engine)
    print('narration.wav + timing.json written; last line ends at', round(prev_end, 1), 's')

if __name__ == '__main__':
    main()
