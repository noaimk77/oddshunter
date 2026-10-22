import sys, json, numpy as np, soundfile as sf, sherpa_onnx
d = "sherpa-onnx-whisper-small/"
rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder=d+"small-encoder.int8.onnx", decoder=d+"small-decoder.int8.onnx",
    tokens=d+"small-tokens.txt", language="fr", task="transcribe", num_threads=4)
audio, sr = sf.read("../voice/v16.wav", dtype="float32")
segs = json.loads(sys.argv[1])
out = []
for a, b in segs:
    s = rec.create_stream(); s.accept_waveform(sr, audio[int(a*sr):int(b*sr)]); rec.decode_stream(s)
    out.append([a, b, s.result.text.strip()]); print(f"{a:6.2f}-{b:6.2f} {s.result.text.strip()}", flush=True)
json.dump(out, open("wh.json", "w"), ensure_ascii=False)
