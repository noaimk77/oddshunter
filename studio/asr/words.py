# zf.json (sherpa zipformer tokens + timestamps) -> zf_words.json [[word, start, end], ...]
import json
d = json.load(open("zf.json"))
words = []
for tok, t in zip(d["tokens"], d["ts"]):
    if tok.startswith(" ") or not words: words.append([tok.strip(), t, t])
    else: words[-1][0] += tok; words[-1][2] = t
json.dump(words, open("zf_words.json", "w"), ensure_ascii=False)
