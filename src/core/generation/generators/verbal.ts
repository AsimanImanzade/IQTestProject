/**
 * Verbal analogies.
 *
 * This is the one category that genuinely resists procedural generation: the relation between
 * "sculptor" and "chisel" is semantic, not structural, so it comes from a curated corpus rather
 * than a rule.
 *
 * LOCALIZATION. A verbal analogy cannot be *translated* word-for-word — an English synonym pair is
 * not an Azerbaijani synonym pair. So the corpus is genuinely BILINGUAL: every pair carries an
 * English form and an independently-authored Azerbaijani form of the *same relation*. A given
 * generated item therefore renders as a coherent analogy in whichever language the test-taker
 * chose, using that language's own vocabulary. English remains the stable key for signatures and
 * de-duplication.
 *
 * NOTE FOR THE NATIVE REVIEWER: the Azerbaijani pairs below are the highest-priority thing to
 * check — a weak synonym/antonym pair makes the item ambiguous. They do not need to match the
 * English words, only to be valid pairs of the same relation.
 */

import type { Difficulty, GeneratedItem, QuestionGenerator, Rng } from "../../types";
import { estimateSeconds, optionCountFor } from "../choices";
import { buildSignature } from "../signature";
import type { GeneratedChoice, LocalizedString } from "../../types";
import { L } from "../../i18n";
import { buildLocalized } from "../i18n-helpers";

type RelationKind =
  | "synonym"
  | "antonym"
  | "part-whole"
  | "category-member"
  | "worker-tool"
  | "degree"
  | "cause-effect"
  | "object-material"
  | "action-result";

/** A word in both languages. English is the stable identity used for dedupe and signatures. */
interface Word {
  en: string;
  az: string;
}

type Pair = readonly [Word, Word];

interface Relation {
  kind: RelationKind;
  description: LocalizedString;
  pairs: readonly Pair[];
}

/** Compact builder: w("candid", "səmimi"). */
const w = (en: string, az: string): Word => ({ en, az });
/** Pair builder. */
const pr = (a: [string, string], b: [string, string]): Pair => [w(a[0], a[1]), w(b[0], b[1])];

const RELATIONS: readonly Relation[] = [
  {
    kind: "synonym",
    description: L(
      "the second word means roughly the same as the first",
      "ikinci söz təxminən birinci ilə eyni mənanı verir",
    ),
    pairs: [
      pr(["candid", "səmimi"], ["frank", "açıq"]),
      pr(["abundant", "bol"], ["plentiful", "çoxlu"]),
      pr(["fragile", "kövrək"], ["delicate", "zərif"]),
      pr(["obstinate", "inadkar"], ["stubborn", "tərs"]),
      pr(["lucid", "aydın"], ["clear", "anlaşıqlı"]),
      pr(["arduous", "çətin"], ["difficult", "ağır"]),
      pr(["placid", "sakit"], ["calm", "dinc"]),
      pr(["vacant", "boş"], ["empty", "xali"]),
      pr(["rapid", "sürətli"], ["swift", "cəld"]),
      pr(["cordial", "mehriban"], ["friendly", "nəzakətli"]),
      pr(["astute", "zirək"], ["shrewd", "fərasətli"]),
      pr(["ample", "kifayət"], ["sufficient", "yetərli"]),
      pr(["frugal", "qənaətcil"], ["thrifty", "təmkinli"]),
      pr(["candour", "düzgünlük"], ["honesty", "dürüstlük"]),
    ],
  },
  {
    kind: "antonym",
    description: L(
      "the second word means the opposite of the first",
      "ikinci söz birincinin əksini bildirir",
    ),
    pairs: [
      pr(["expand", "genişlənmək"], ["contract", "daralmaq"]),
      pr(["scarce", "qıt"], ["plentiful", "bol"]),
      pr(["ascend", "qalxmaq"], ["descend", "enmək"]),
      pr(["praise", "tərifləmək"], ["criticise", "tənqid etmək"]),
      pr(["opaque", "qeyri-şəffaf"], ["transparent", "şəffaf"]),
      pr(["reject", "rədd etmək"], ["accept", "qəbul etmək"]),
      pr(["temporary", "müvəqqəti"], ["permanent", "daimi"]),
      pr(["deliberate", "qəsdən"], ["accidental", "təsadüfi"]),
      pr(["surplus", "artıqlıq"], ["deficit", "çatışmazlıq"]),
      pr(["conceal", "gizlətmək"], ["reveal", "açmaq"]),
      pr(["rigid", "sərt"], ["flexible", "çevik"]),
      pr(["ancient", "qədim"], ["modern", "müasir"]),
      pr(["humble", "təvazökar"], ["arrogant", "təkəbbürlü"]),
      pr(["convex", "qabarıq"], ["concave", "çökük"]),
    ],
  },
  {
    kind: "part-whole",
    description: L(
      "the first is a part of the second",
      "birincisi ikincisinin bir hissəsidir",
    ),
    pairs: [
      pr(["petal", "ləçək"], ["flower", "gül"]),
      pr(["chapter", "fəsil"], ["book", "kitab"]),
      pr(["deck", "göyərtə"], ["ship", "gəmi"]),
      pr(["stanza", "bənd"], ["poem", "şeir"]),
      pr(["hinge", "rəzə"], ["door", "qapı"]),
      pr(["pupil", "bəbək"], ["eye", "göz"]),
      pr(["rung", "pillə"], ["ladder", "nərdivan"]),
      pr(["spoke", "mil"], ["wheel", "təkər"]),
      pr(["clause", "maddə"], ["contract", "müqavilə"]),
      pr(["nucleus", "nüvə"], ["cell", "hüceyrə"]),
      pr(["brick", "kərpic"], ["wall", "divar"]),
      pr(["island", "ada"], ["archipelago", "arxipelaq"]),
      pr(["scene", "səhnə"], ["play", "tamaşa"]),
      pr(["leaf", "yarpaq"], ["tree", "ağac"]),
    ],
  },
  {
    kind: "category-member",
    description: L(
      "the first is a specific example of the second",
      "birincisi ikincisinin konkret nümunəsidir",
    ),
    pairs: [
      pr(["oak", "palıd"], ["tree", "ağac"]),
      pr(["sonnet", "sonet"], ["poem", "şeir"]),
      pr(["copper", "mis"], ["metal", "metal"]),
      pr(["sparrow", "sərçə"], ["bird", "quş"]),
      pr(["cello", "violonçel"], ["instrument", "alət"]),
      pr(["basalt", "bazalt"], ["rock", "qaya"]),
      pr(["hurricane", "qasırğa"], ["storm", "fırtına"]),
      pr(["algebra", "cəbr"], ["mathematics", "riyaziyyat"]),
      pr(["cotton", "pambıq"], ["fabric", "parça"]),
      pr(["fresco", "freska"], ["painting", "rəsm"]),
      pr(["python", "piton"], ["reptile", "sürünən"]),
      pr(["waltz", "vals"], ["dance", "rəqs"]),
      pr(["cedar", "sidr"], ["tree", "ağac"]),
      pr(["quartz", "kvars"], ["mineral", "mineral"]),
    ],
  },
  {
    kind: "worker-tool",
    description: L(
      "the first person characteristically uses the second",
      "birinci şəxs xarakterik olaraq ikincidən istifadə edir",
    ),
    pairs: [
      pr(["sculptor", "heykəltəraş"], ["chisel", "iskənə"]),
      pr(["surgeon", "cərrah"], ["scalpel", "neştər"]),
      pr(["cartographer", "kartoqraf"], ["compass", "pərgar"]),
      pr(["blacksmith", "dəmirçi"], ["anvil", "zindan"]),
      pr(["astronomer", "astronom"], ["telescope", "teleskop"]),
      pr(["gardener", "bağban"], ["spade", "bel"]),
      pr(["carpenter", "dülgər"], ["plane", "rəndə"]),
      pr(["chemist", "kimyaçı"], ["pipette", "pipetka"]),
      pr(["conductor", "dirijor"], ["baton", "çubuq"]),
      pr(["archer", "oxatan"], ["bow", "yay"]),
      pr(["tailor", "dərzi"], ["needle", "iynə"]),
      pr(["mason", "bənna"], ["trowel", "mala"]),
      pr(["welder", "qaynaqçı"], ["torch", "məşəl"]),
      pr(["potter", "dulusçu"], ["kiln", "kürə"]),
    ],
  },
  {
    kind: "degree",
    description: L(
      "the second is a more intense form of the first",
      "ikincisi birincinin daha güclü formasıdır",
    ),
    pairs: [
      pr(["warm", "isti"], ["scorching", "qaynar"]),
      pr(["large", "böyük"], ["colossal", "nəhəng"]),
      pr(["tired", "yorğun"], ["exhausted", "əldən düşmüş"]),
      pr(["small", "kiçik"], ["minuscule", "cırtdan"]),
      pr(["quiet", "sakit"], ["silent", "səssiz"]),
      pr(["sad", "kədərli"], ["despondent", "məyus"]),
      pr(["quick", "sürətli"], ["instantaneous", "ani"]),
      pr(["bright", "parlaq"], ["dazzling", "göz qamaşdıran"]),
      pr(["surprised", "təəccüblü"], ["astonished", "heyrətli"]),
      pr(["annoyed", "əsəbi"], ["furious", "qəzəbli"]),
      pr(["scared", "qorxmuş"], ["terrified", "dəhşətə gəlmiş"]),
      pr(["dislike", "xoşlamamaq"], ["loathe", "nifrət etmək"]),
    ],
  },
  {
    kind: "cause-effect",
    description: L(
      "the first brings about the second",
      "birincisi ikincisinə səbəb olur",
    ),
    pairs: [
      pr(["drought", "quraqlıq"], ["famine", "aclıq"]),
      pr(["friction", "sürtünmə"], ["heat", "istilik"]),
      pr(["vaccine", "peyvənd"], ["immunity", "immunitet"]),
      pr(["erosion", "eroziya"], ["canyon", "dərə"]),
      pr(["fermentation", "qıcqırma"], ["alcohol", "spirt"]),
      pr(["insomnia", "yuxusuzluq"], ["fatigue", "yorğunluq"]),
      pr(["spark", "qığılcım"], ["fire", "yanğın"]),
      pr(["inflation", "inflyasiya"], ["devaluation", "dəyərsizləşmə"]),
      pr(["rehearsal", "məşq"], ["fluency", "səlislik"]),
      pr(["frost", "şaxta"], ["cracking", "çatlama"]),
      pr(["neglect", "laqeydlik"], ["decay", "çürümə"]),
      pr(["rainfall", "yağış"], ["flooding", "daşqın"]),
    ],
  },
  {
    kind: "object-material",
    description: L(
      "the first is made from the second",
      "birincisi ikincisindən hazırlanır",
    ),
    pairs: [
      pr(["window", "pəncərə"], ["glass", "şüşə"]),
      pr(["tyre", "təkər"], ["rubber", "rezin"]),
      pr(["candle", "şam"], ["wax", "mum"]),
      pr(["sweater", "sviter"], ["wool", "yun"]),
      pr(["barrel", "çəllək"], ["oak", "palıd"]),
      pr(["coin", "sikkə"], ["alloy", "ərinti"]),
      pr(["rope", "kəndir"], ["hemp", "çətənə"]),
      pr(["page", "səhifə"], ["paper", "kağız"]),
      pr(["statue", "heykəl"], ["marble", "mərmər"]),
      pr(["blade", "bıçaq"], ["steel", "polad"]),
      pr(["jug", "küpə"], ["clay", "gil"]),
      pr(["sail", "yelkən"], ["canvas", "kətan"]),
    ],
  },
  {
    kind: "action-result",
    description: L(
      "performing the first produces the second",
      "birincini etmək ikincisini yaradır",
    ),
    pairs: [
      pr(["knead", "yoğurmaq"], ["dough", "xəmir"]),
      pr(["compose", "bəstələmək"], ["symphony", "simfoniya"]),
      pr(["weave", "toxumaq"], ["textile", "parça"]),
      pr(["excavate", "qazmaq"], ["trench", "xəndək"]),
      pr(["distil", "damıtmaq"], ["spirit", "spirt"]),
      pr(["forge", "döymək"], ["blade", "bıçaq"]),
      pr(["draft", "layihələndirmək"], ["blueprint", "plan"]),
      pr(["translate", "tərcümə etmək"], ["version", "versiya"]),
      pr(["survey", "ölçmək"], ["map", "xəritə"]),
      pr(["smelt", "əritmək"], ["ingot", "külçə"]),
      pr(["engrave", "oymaq"], ["inscription", "yazı"]),
      pr(["cultivate", "becərmək"], ["harvest", "məhsul"]),
    ],
  },
];

interface WordEntry {
  word: Word;
  relation: RelationKind;
}

/** Every word that appears as the second element of any pair. */
const ALL_SECOND_WORDS: readonly WordEntry[] = RELATIONS.flatMap((relation) =>
  relation.pairs.map(([, b]) => ({ word: b, relation: relation.kind })),
);

/** Render a word for the analogy stem — upper-cased in the active language. */
function upper(word: Word, locale: "en" | "az"): string {
  return word[locale].toUpperCase();
}

const verbalAnalogyGenerator: QuestionGenerator = {
  id: "verbal.analogy",
  category: "analogies",
  supportedDifficulties: [1, 2, 3, 4, 5, 6, 7, 8],

  generate(rng: Rng, difficulty: Difficulty): GeneratedItem | null {
    // Harder items draw on relations that are easier to confuse with one another.
    const pool =
      difficulty <= 3
        ? RELATIONS.filter((r) =>
            (["synonym", "antonym", "part-whole", "category-member"] as RelationKind[]).includes(r.kind),
          )
        : RELATIONS;

    const relation = rng.pick(pool);
    if (relation.pairs.length < 2) return null;

    const [example, target] = rng.sample(relation.pairs, 2);
    if (!example || !target) return null;

    const [exampleA, exampleB] = example;
    const [targetA, answer] = target;

    // Uniqueness is keyed on the English identity so both languages stay in lock-step.
    const used = new Set<string>([answer.en, targetA.en, exampleA.en, exampleB.en]);

    // Same-relation words paired with a *different* stem: tempting for anyone who identified the
    // relation but not the specific pairing.
    const sameRelationWords = relation.pairs
      .filter(([a, b]) => a.en !== targetA.en && b.en !== answer.en && b.en !== exampleB.en)
      .map(([, b]) => b);

    // Words from a *different* relation: tempting for anyone who spotted an association without
    // identifying which one.
    const otherRelationWords = ALL_SECOND_WORDS.filter(
      (entry) => entry.relation !== relation.kind && !used.has(entry.word.en),
    ).map((entry) => entry.word);

    const optionCount = optionCountFor(difficulty);
    const distractors: { word: Word; rationale: LocalizedString }[] = [];

    for (const word of rng.shuffle(sameRelationWords).slice(0, 2)) {
      if (used.has(word.en)) continue;
      used.add(word.en);
      distractors.push({
        word,
        rationale: buildLocalized((l) =>
          l === "az"
            ? `Eyni növ əlaqəyə aiddir, lakin "${targetA.az}" ilə yox.`
            : `Belongs to the same kind of relationship, but not with "${targetA.en}".`,
        ),
      });
    }

    for (const word of rng.shuffle(otherRelationWords)) {
      if (distractors.length >= optionCount - 1) break;
      if (used.has(word.en)) continue;
      used.add(word.en);
      distractors.push({
        word,
        rationale: buildLocalized((l) =>
          l === "az"
            ? `Mövzu ilə əlaqəlidir, lakin bu əlaqə "${exampleA.az}" və "${exampleB.az}" arasındakı əlaqə deyil.`
            : `Related to the topic, but the connection is not the one linking "${exampleA.en}" and "${exampleB.en}".`,
        ),
      });
    }

    if (distractors.length < optionCount - 1) return null;

    const choices: GeneratedChoice[] = rng.shuffle([
      {
        text: buildLocalized((l) => (l === "az" ? answer.az : answer.en)),
        isCorrect: true,
        rationale: buildLocalized((l) =>
          l === "az"
            ? `Cütü eyni əlaqə ilə tamamlayır: ${relation.description.az ?? relation.description.en}.`
            : `Completes the pair under the same relationship: ${relation.description.en}.`,
        ),
      },
      ...distractors.slice(0, optionCount - 1).map((d) => ({
        text: buildLocalized((l) => (l === "az" ? d.word.az : d.word.en)),
        isCorrect: false,
        rationale: d.rationale,
      })),
    ]);

    return {
      category: "analogies",
      difficulty,
      stem: buildLocalized((l) => {
        const loc = l === "az" ? "az" : "en";
        return l === "az"
          ? `${upper(exampleA, "az")} sözü ${upper(exampleB, "az")} sözünə necə aiddirsə, ${upper(targetA, "az")} sözü də … sözünə elə aiddir?`
          : `${upper(exampleA, loc)} is to ${upper(exampleB, loc)} as ${upper(targetA, loc)} is to …?`;
      }),
      choices,
      explanation: buildLocalized((l) =>
        l === "az"
          ? `Birinci cütdə ${relation.description.az ?? relation.description.en}: "${exampleA.az}" → "${exampleB.az}". Eyni əlaqəni "${targetA.az}" sözünə tətbiq etsək "${answer.az}" alınır.`
          : `In the first pair, ${relation.description.en}: "${exampleA.en}" → "${exampleB.en}". Applying the same relationship to "${targetA.en}" gives "${answer.en}".`,
      ),
      estimatedSeconds: estimateSeconds(difficulty, 20),
      generatorId: verbalAnalogyGenerator.id,
      seed: "",
      signature: buildSignature("analogies-verbal", relation.kind, exampleA.en, targetA.en),
    };
  },
};

export const verbalGenerators: readonly QuestionGenerator[] = [verbalAnalogyGenerator];
