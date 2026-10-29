import { describe, expect, it } from "vitest";
import { combineVerdicts, isBareVerdict, locatePickMessage, mentionsTeam, readVerdict, verdictFromChat, type ChatMessage } from "./telegramResults";

const teams = { homeTeam: "The Audacity", awayTeam: "Chinggis Warriors" };
const T0 = Date.UTC(2026, 9, 29, 6, 40) / 1000; // pick posted 07:40 Paris
const pick = { detectedAt: new Date((T0 + 20) * 1000), rawText: "W2 Chinggis Warriors 1.69" };
const msg = (id: number, minutes: number, text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  date: T0 + minutes * 60,
  text,
  editDate: null,
  replyToId: null,
  ...extra,
});

describe("readVerdict", () => {
  it("lit gagné, perdu et remboursé en FR, EN, RU et emojis", () => {
    expect(readVerdict("Le pari est passé ✅")).toBe("WON");
    expect(readVerdict("✅✅✅")).toBe("WON");
    expect(readVerdict("Gagné")).toBe("WON");
    expect(readVerdict("зашло")).toBe("WON");
    expect(readVerdict("❌")).toBe("LOST");
    expect(readVerdict("Perdu malheureusement")).toBe("LOST");
    expect(readVerdict("не зашло")).toBe("LOST");
    expect(readVerdict("Match annulé, remboursé")).toBe("VOID");
    expect(readVerdict("🔁")).toBe("VOID");
  });

  it("rien quand le message n'en dit rien ou dit les deux", () => {
    expect(readVerdict("W2 Chinggis Warriors 1.69")).toBeNull();
    expect(readVerdict("Pronostic : Plus de 6,5 buts")).toBeNull();
    expect(readVerdict("✅ ❌")).toBeNull();
    expect(readVerdict("")).toBeNull();
  });

  it("un résultat court se distingue d'un long message", () => {
    expect(isBareVerdict("Passé ✅✅")).toBe(true);
    expect(isBareVerdict("✅ Hier on a gagné trois paris sur quatre, rejoignez le VIP pour la suite")).toBe(false);
  });
});

describe("mentionsTeam", () => {
  it("par un mot distinctif, sans accents ni casse", () => {
    expect(mentionsTeam("CHINGGIS ✅", teams)).toBe(true);
    expect(mentionsTeam("audacity passé", teams)).toBe(true);
    expect(mentionsTeam("Kenkre U19 ✅", { homeTeam: "Soccerstar", awayTeam: "Kenkre U19" })).toBe(true);
  });

  it("pas par un mot générique", () => {
    expect(mentionsTeam("United ✅ U20", { homeTeam: "Dagon Star United U20", awayTeam: "Myawady FC U20" })).toBe(false);
  });
});

describe("verdictFromChat", () => {
  const pickMsg = msg(100, 0, "W2 Chinggis Warriors 1.69");

  it("retrouve le message du prono par son texte", () => {
    expect(locatePickMessage(pick, [msg(99, -5, "Bonjour"), pickMsg, msg(101, 1, "go")])?.id).toBe(100);
  });

  it("1. prono modifié par le tipster", () => {
    const edited = { ...pickMsg, text: "W2 Chinggis Warriors 1.69 ✅", editDate: T0 + 3600 };
    expect(verdictFromChat(pick, [edited], [], teams)).toBe("WON");
  });

  it("2. réponse au prono", () => {
    expect(verdictFromChat(pick, [pickMsg, msg(105, 50, "Passé", { replyToId: 100 })], [], teams)).toBe("WON");
  });

  it("3. message qui nomme le match, même après d'autres pronos", () => {
    const later = [pickMsg, msg(110, 90, "Over 2.5 Team X"), msg(111, 120, "Chinggis ❌")];
    expect(verdictFromChat(pick, later, [(T0 + 90 * 60) * 1000], teams)).toBe("LOST");
  });

  it("4. résultat seul juste après le prono", () => {
    expect(verdictFromChat(pick, [pickMsg, msg(102, 45, "✅✅✅")], [], teams)).toBe("WON");
  });

  it("4. pas de résultat seul s'il peut appartenir à un autre prono", () => {
    // another pick of this chat 2h before ours: the ✅ may be for that one
    expect(verdictFromChat(pick, [pickMsg, msg(102, 45, "✅✅✅")], [(T0 - 2 * 3600) * 1000], teams)).toBeNull();
    // another pick between ours and the ✅
    expect(verdictFromChat(pick, [pickMsg, msg(102, 45, "✅✅✅")], [(T0 + 30 * 60) * 1000], teams)).toBeNull();
    // a ✅ replying to some other message
    expect(verdictFromChat(pick, [pickMsg, msg(102, 45, "✅", { replyToId: 50 })], [], teams)).toBeNull();
  });

  it("rien quand le groupe n'a rien dit", () => {
    expect(verdictFromChat(pick, [pickMsg, msg(102, 30, "Next game soon")], [], teams)).toBeNull();
    expect(verdictFromChat(pick, [], [], teams)).toBeNull();
  });
});

describe("combineVerdicts", () => {
  it("le verdict commun, rien si les groupes se contredisent", () => {
    expect(combineVerdicts([null, "WON", "WON"])).toBe("WON");
    expect(combineVerdicts(["WON", "LOST"])).toBeNull();
    expect(combineVerdicts([null, null])).toBeNull();
  });
});
