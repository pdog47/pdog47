"""
Plaud -> Second Brain transcriber (Windows + NVIDIA)

Drop exported audio into:
    <BASE>\\Inbox\\Work       -> notes land in your Work vault
    <BASE>\\Inbox\\Personal   -> notes land in your Personal vault
    <BASE>\\Inbox             -> notes land in <BASE>\\Unsorted

Run it (double-click run.bat). Each file gets transcribed on your GPU,
saved as a Markdown note, and the audio is moved to <BASE>\\Audio\\...
so nothing gets transcribed twice.
"""

import os
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

# ======================= SETTINGS (edit these) =======================
BASE = Path(r"C:\SecondBrain")
WORK_VAULT = Path(r"C:\SecondBrain\Vaults\Work")          # your Obsidian Work vault
PERSONAL_VAULT = Path(r"C:\SecondBrain\Vaults\Personal")  # your Obsidian Personal vault

MODEL = "large-v3"         # best accuracy. If you get out-of-memory errors use "medium"
COMPUTE = "float16"        # if VRAM is tight (6GB or less) use "int8_float16"
LANGUAGE = "en"            # set to None to auto-detect
PARAGRAPH_GAP = 2.0        # seconds of silence that starts a new paragraph
# =====================================================================

AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".ogg", ".opus", ".flac", ".aac", ".webm"}
INBOX = BASE / "Inbox"
ROUTES = {
    "Work": (INBOX / "Work", WORK_VAULT / "Transcripts", BASE / "Audio" / "Work"),
    "Personal": (INBOX / "Personal", PERSONAL_VAULT / "Transcripts", BASE / "Audio" / "Personal"),
    "Unsorted": (INBOX, BASE / "Unsorted", BASE / "Audio" / "Unsorted"),
}


def add_cuda_dlls():
    """Let Windows find the CUDA libraries installed by pip (nvidia-cublas/cudnn)."""
    if os.name != "nt":
        return
    try:
        import nvidia  # namespace package from nvidia-cublas-cu12 / nvidia-cudnn-cu12
    except ImportError:
        return
    for root in nvidia.__path__:
        for bin_dir in Path(root).glob("*/bin"):
            os.add_dll_directory(str(bin_dir))
            os.environ["PATH"] = str(bin_dir) + os.pathsep + os.environ["PATH"]


def load_model():
    from faster_whisper import WhisperModel

    try:
        model = WhisperModel(MODEL, device="cuda", compute_type=COMPUTE)
        # missing CUDA DLLs only show up on first use, so do a 1-second test run
        import numpy as np
        list(model.transcribe(np.zeros(16000, dtype=np.float32), language="en")[0])
        print(f"Loaded {MODEL} on GPU ({COMPUTE})")
        return model
    except Exception as e:
        print(f"GPU load failed ({e})\nFalling back to CPU. This works but is much slower.")
        return WhisperModel("medium", device="cpu", compute_type="int8")


def fmt_ts(seconds):
    seconds = int(seconds)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h:d}:{m:02d}:{s:02d}" if h else f"{m:d}:{s:02d}"


def find_audio():
    """Yield (category, path) for every finished audio file in the inboxes."""
    now = time.time()
    for category, (inbox, _, _) in ROUTES.items():
        if not inbox.exists():
            continue
        for f in sorted(inbox.iterdir()):
            if f.is_file() and f.suffix.lower() in AUDIO_EXTS:
                if now - f.stat().st_mtime < 15:
                    print(f"Skipping {f.name} (still copying?), run again in a minute")
                    continue
                yield category, f


def unique_path(path):
    n = 2
    candidate = path
    while candidate.exists():
        candidate = path.with_name(f"{path.stem} ({n}){path.suffix}")
        n += 1
    return candidate


def transcribe(model, category, audio):
    _, notes_dir, audio_dir = ROUTES[category]
    notes_dir.mkdir(parents=True, exist_ok=True)
    audio_dir.mkdir(parents=True, exist_ok=True)

    recorded = datetime.fromtimestamp(audio.stat().st_mtime)
    print(f"\n[{category}] {audio.name}")
    start = time.time()

    # vad_filter skips silence, which matters a lot for all-day recordings
    segments, info = model.transcribe(
        str(audio),
        language=LANGUAGE,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 1000},
        beam_size=5,
    )

    paragraphs, current, para_start, last_end = [], [], None, None
    for seg in segments:
        text = seg.text.strip()
        if not text:
            continue
        if last_end is not None and seg.start - last_end > PARAGRAPH_GAP and current:
            paragraphs.append((para_start, " ".join(current)))
            current, para_start = [], None
        if para_start is None:
            para_start = seg.start
        current.append(text)
        last_end = seg.end
        print(f"  {fmt_ts(seg.start)} / {fmt_ts(info.duration)}", end="\r")
    if current:
        paragraphs.append((para_start, " ".join(current)))

    title = f"{recorded:%Y-%m-%d %H%M} {audio.stem}"
    archived = unique_path(audio_dir / audio.name)
    body = "\n\n".join(f"**[{fmt_ts(t)}]** {p}" for t, p in paragraphs) or "_No speech detected._"
    note = (
        "---\n"
        f"type: {category.lower()}\n"
        f"recorded: {recorded:%Y-%m-%d %H:%M}\n"
        f"duration: {fmt_ts(info.duration)}\n"
        f"audio: '{archived}'\n"  # single quotes so Windows backslashes stay literal
        "tags: [transcript]\n"
        "---\n\n"
        f"# {title}\n\n"
        "## Summary\n\n_Paste into Claude: \"Pull action items, objections, and anything I promised.\"_\n\n"
        "## Transcript\n\n"
        f"{body}\n"
    )

    note_path = unique_path(notes_dir / f"{title}.md")
    note_path.write_text(note, encoding="utf-8")
    shutil.move(str(audio), str(archived))

    took = time.time() - start
    print(f"  done in {took:.0f}s ({fmt_ts(info.duration)} of audio) -> {note_path}")


def main():
    for _, (inbox, _, _) in ROUTES.items():
        inbox.mkdir(parents=True, exist_ok=True)

    jobs = list(find_audio())
    if not jobs:
        print(f"Nothing to do. Drop audio into {INBOX}\\Work or {INBOX}\\Personal")
        return

    add_cuda_dlls()
    model = load_model()
    failed = 0
    for category, audio in jobs:
        try:
            transcribe(model, category, audio)
        except Exception as e:
            failed += 1
            print(f"  FAILED on {audio.name}: {e} (left it in the inbox)")
    print(f"\nFinished {len(jobs) - failed}/{len(jobs)} files.")


if __name__ == "__main__":
    main()
    if "--no-pause" not in sys.argv and os.name == "nt":
        input("\nPress Enter to close...")
