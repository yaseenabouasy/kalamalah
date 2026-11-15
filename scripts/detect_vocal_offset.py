"""
scripts/detect_vocal_offset.py

Detects vocal onset in Quran recitation audios (first 12s scan).
Handles Basmalah pauses vs Ayah 1 starts without modifying manual user offsets.
"""
import sys
import json
import os
import re
import tempfile
import urllib.request
import urllib.error
import argparse
from pathlib import Path
import numpy as np

def analyze_recitation_onset(audio_source: str, surah_number: int = 1, max_scan_sec: float = 12.0) -> dict:
    try:
        import librosa
    except ImportError:
        return {"error": "librosa is required: pip install librosa soundfile numpy"}

    # Load first 12 seconds
    y, sr = librosa.load(audio_source, sr=22050, duration=max_scan_sec, mono=True)
    if len(y) == 0:
        return {"vocal_start_ms": 0, "has_basmala": False, "confidence": 0.0}

    # Extract harmonic component (voice) vs percussive noise
    y_harm, _ = librosa.effects.hpss(y)

    # Compute short-time energy (RMS) with 20ms hop
    hop_length = 512
    frame_length = 2048
    rms = librosa.feature.rms(y=y_harm, frame_length=frame_length, hop_length=hop_length)[0]
    times = librosa.times_like(rms, sr=sr, hop_length=hop_length)

    # Dynamic noise floor threshold
    noise_frames = int(0.3 * sr / hop_length)
    noise_baseline = np.median(rms[:max(1, noise_frames)])
    active_thresh = max(noise_baseline * 3.2, 0.012)

    # Group active voice intervals
    is_voiced = rms > active_thresh
    voiced_intervals = []
    in_speech = False
    start_t = 0.0

    for t, voiced in zip(times, is_voiced):
        if voiced and not in_speech:
            in_speech = True
            start_t = t
        elif not voiced and in_speech:
            in_speech = False
            if t - start_t >= 0.25:  # filter brief clicks
                voiced_intervals.append((float(start_t), float(t)))
    if in_speech:
        voiced_intervals.append((float(start_t), float(times[-1])))

    if not voiced_intervals:
        return {"vocal_start_ms": 0, "has_basmala": False, "confidence": 0.0}

    first_start, first_end = voiced_intervals[0]
    first_dur = first_end - first_start

    # Basmalah discrimination logic
    has_basmala = False
    ayah_1_start_sec = first_start

    # Surah 1 (Al-Fatihah) and Surah 9 (At-Tawbah) don't have separate pre-surah Basmalah
    if surah_number not in (1, 9) and len(voiced_intervals) >= 2:
        # Typical Basmalah duration: 2.8s to 6.5s followed by an inhale pause
        second_start = voiced_intervals[1][0]
        pause_dur = second_start - first_end

        if 2.5 <= first_dur <= 7.0 and pause_dur >= 0.35:
            has_basmala = True
            ayah_1_start_sec = second_start

    return {
        "audio": audio_source,
        "surah": surah_number,
        "vocal_start_ms": int(round(first_start * 1000)),
        "ayah1_start_ms": int(round(ayah_1_start_sec * 1000)),
        "has_basmala": has_basmala,
        "detected_intervals_sec": [{"start": round(s, 2), "end": round(e, 2)} for s, e in voiced_intervals],
        "confidence": round(float(np.max(rms) / (active_thresh + 1e-6)), 2),
    }

def load_reciters_from_catalog(catalog_path: Path) -> list[dict]:
    text = catalog_path.read_text(encoding="utf-8")
    pattern = re.compile(
        r"slug:\s*'([^']+)'[\s\S]*?audioBaseUrl:\s*'([^']+)'",
        re.MULTILINE,
    )
    return [{"slug": m.group(1), "audioBaseUrl": m.group(2).rstrip("/")} for m in pattern.finditer(text)]

def download_audio_head(url: str, max_bytes: int = 524288) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "kalamalah-player/1.0",
            "Range": f"bytes=0-{max_bytes - 1}",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = resp.read(max_bytes)
    tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
    try:
        tmp.write(data)
        return tmp.name
    finally:
        tmp.close()

def main():
    parser = argparse.ArgumentParser(description="Quran Vocal Start & Basmalah Detector")
    parser.add_argument("audio", nargs="?", default=None, help="Audio file path or stream URL (omit to scan all catalog reciters)")
    parser.add_argument("--surah", type=int, default=None, help="Surah number (1-114; omit to scan all 114 surahs in waves)")
    parser.add_argument("--max-scan", type=float, default=12.0, help="Max scan window in seconds")
    parser.add_argument("--out", default=None, help="Optional JSON output file path")
    args = parser.parse_args()

    if args.audio:
        result = analyze_recitation_onset(args.audio, surah_number=args.surah or 1, max_scan_sec=args.max_scan)
        output = json.dumps(result, indent=2)
    else:
        catalog_path = Path(__file__).resolve().parent.parent / "src" / "server" / "reciters-catalog.ts"
        reciters = load_reciters_from_catalog(catalog_path)
        surahs = [args.surah] if args.surah is not None else list(range(1, 115))
        results = []
        for surah_num in surahs:
            surah_padded = f"{surah_num:03d}"
            print(f"Wave {surah_padded}/114...", file=sys.stderr, flush=True)
            for reciter in reciters:
                if reciter["slug"] == "abu-bakr-al-shatri":
                    url = f"https://server11.mp3quran.net/shatri/{surah_padded}.mp3"
                elif "api.kalamalah.com/api/" in reciter["audioBaseUrl"]:
                    url = f"{reciter['audioBaseUrl']}/{surah_padded}"
                else:
                    url = f"{reciter['audioBaseUrl']}/{surah_padded}.mp3"
                tmp_path = None
                try:
                    tmp_path = download_audio_head(url)
                    res = analyze_recitation_onset(tmp_path, surah_number=surah_num, max_scan_sec=args.max_scan)
                    res["reciter"] = reciter["slug"]
                    res["audio"] = url
                    results.append(res)
                except Exception as exc:
                    results.append({
                        "reciter": reciter["slug"],
                        "audio": url,
                        "surah": surah_num,
                        "error": str(exc),
                    })
                finally:
                    if tmp_path and os.path.exists(tmp_path):
                        os.remove(tmp_path)
        output = json.dumps(results, indent=2)

    if args.out:
        Path(args.out).write_text(output, encoding="utf-8")
    print(output)

if __name__ == "__main__":
    main()
