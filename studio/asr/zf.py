import sys, json, numpy as np, soundfile as sf, sherpa_onnx
d = "sherpa-onnx-streaming-zipformer-fr-2023-04-14/"
rec = sherpa_onnx.OnlineRecognizer.from_transducer(
    tokens=d+"tokens.txt", encoder=d+"encoder-epoch-29-avg-9-with-averaged-model.onnx",
    decoder=d+"decoder-epoch-29-avg-9-with-averaged-model.onnx", joiner=d+"joiner-epoch-29-avg-9-with-averaged-model.onnx",
    num_threads=4, sample_rate=16000, feature_dim=80, decoding_method="greedy_search")
audio, sr = sf.read(sys.argv[1], dtype="float32")
s = rec.create_stream()
s.accept_waveform(sr, audio)
s.accept_waveform(sr, np.zeros(int(sr*1.0), dtype="float32"))
s.input_finished()
while rec.is_ready(s): rec.decode_stream(s)
r = rec.get_result_all(s)
json.dump({"text": r.text, "tokens": r.tokens, "ts": r.timestamps}, open(sys.argv[2], "w"), ensure_ascii=False)
print(r.text)
