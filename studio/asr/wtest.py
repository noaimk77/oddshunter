import sys, json, numpy as np, soundfile as sf, sherpa_onnx
d = "sherpa-onnx-whisper-small/"
rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder=d+"small-encoder.onnx", decoder=d+"small-decoder.onnx",
    tokens=d+"small-tokens.txt", language="fr", task="transcribe", num_threads=4)
audio, sr = sf.read("../voice/v16.wav", dtype="float32")
for spec in sys.argv[1:]:
    parts = [list(map(float, p.split(":"))) for p in spec.split(",")]
    x = np.concatenate([audio[int(a*sr):int(b*sr)] for a, b in parts] + [np.zeros(sr//2, dtype="float32")])
    s = rec.create_stream(); s.accept_waveform(sr, x); rec.decode_stream(s)
    print(spec, "=>", s.result.text.strip(), flush=True)
