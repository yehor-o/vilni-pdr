"""Збирає дані для застосунку: питання всіх категорій (крім причепів) + правильні відповіді.

Вхід:  data/questions.json, data/answers.A.json, data/answers.B.json, data/images/,
       data/answers.tiebreak.json  (третє читання для клітинок, де A і B розійшлися)
       data/text_fixes.json        (відновлені пробіли там, де в PDF слова надруковано разом)
Вихід: data/answers.json            (узгоджені відповіді; null там, де два проходи розійшлися)
       public/data/questions.json   (усі категорії; те, що читає застосунок)
       public/img/                  (картинки питань, що ввійшли в набір)

Запуск: .venv/bin/python -I scripts/build_data.py
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PUBLIC = ROOT / "public"

# Загальні розділи 1–39 входять до всіх категорій; додаткові розділи беремо за
# назвами розділів в офіційному документі («ДОДАТКОВІ ПИТАННЯ ЩОДО КАТЕГОРІЙ …»).
# Категорії з причепом (BE, C1E, CE, D1E, DE; розділи 56–59) не збираємо: з офіційних
# джерел не видно, які ще розділи входять до їхнього іспиту (див. DECISIONS.md).
GENERAL_SECTION_IDS = set(range(1, 40))
CATEGORIES = [
    {"id": "A", "title": "A1, A", "extra": {40, 41, 42, 43}},
    {"id": "B", "title": "B1, B", "extra": {44, 45, 46, 47}},
    {"id": "C", "title": "C1, C", "extra": {48, 49, 50, 51}},
    {"id": "D", "title": "D1, D", "extra": {52, 53, 54, 55}},
    {"id": "T", "title": "T", "extra": {60, 61, 62, 63}},
]
# Блоки іспиту (ГСЦ, стаття від 16.09.2025: 10 питань з ПДР, 4 з основ безпеки руху,
# 4 з будови та експлуатації, 2 з домедичної допомоги). Розподіл розділів по блоках
# ГСЦ не публікує: це припущення за назвами розділів, погоджене власником (DECISIONS.md).
def exam_block(sec_id: int, title: str) -> str:
    if sec_id == 37:
        return "firstaid"
    if sec_id == 35 or "(БЕЗПЕКА)" in title:
        return "safety"
    if "(БУДОВА" in title:
        return "construction"
    return "rules"


EXAM_BLOCKS = [
    {"id": "rules", "title": "Правила дорожнього руху", "count": 10},
    {"id": "safety", "title": "Основи безпеки руху", "count": 4},
    {"id": "construction", "title": "Будова та експлуатація", "count": 4},
    {"id": "firstaid", "title": "Домедична допомога", "count": 2},
]

ALL_SECTION_IDS = GENERAL_SECTION_IDS.union(*(c["extra"] for c in CATEGORIES))

MAX_IMAGE_WIDTH = 900  # px; ширина колонки застосунку 560 px, запас для екранів 2x
WEBP_QUALITY = 60


def main() -> int:
    questions = json.loads((DATA / "questions.json").read_text(encoding="utf-8"))
    a = json.loads((DATA / "answers.A.json").read_text(encoding="utf-8"))["sections"]
    b = json.loads((DATA / "answers.B.json").read_text(encoding="utf-8"))["sections"]

    tb_path = DATA / "answers.tiebreak.json"
    tiebreak = json.loads(tb_path.read_text(encoding="utf-8"))["sections"] if tb_path.exists() else {}

    # 1. Узгоджені відповіді: беремо значення лише там, де обидва проходи збіглися,
    #    або де третє читання (tiebreak) збіглося з одним із них.
    merged, disputed = {}, []
    for sec in sorted(set(a) | set(b), key=lambda s: [int(x) for x in s.split(".")]):
        merged[sec] = {}
        qa, qb = a.get(sec, {}), b.get(sec, {})
        for q in sorted(set(qa) | set(qb), key=int):
            va, vb = qa.get(q), qb.get(q)
            if va is not None and va == vb:
                merged[sec][q] = va
            elif (tb := tiebreak.get(sec, {}).get(q)) and tb["value"] in (va, vb):
                merged[sec][q] = tb["value"]
            else:
                merged[sec][q] = None
                disputed.append({"section": sec, "question": int(q), "A": va, "B": vb})
    (DATA / "answers.json").write_text(
        json.dumps({"sections": merged, "disputed": disputed}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )

    # Пояснення «Чому так?» (текст проєкту з посиланнями на пункти ПДР), за темами.
    explanations = {}
    for f in sorted((DATA / "explanations").glob("*.json")):
        explanations.update(json.loads(f.read_text(encoding="utf-8"))["items"])

    # Відновлені пробіли: змінюємо лише пробіли, решта тексту лишається офіційною.
    errors = []
    text_fixes = {}
    for fx in json.loads((DATA / "text_fixes.json").read_text(encoding="utf-8"))["fixes"]:
        if fx["from"].replace(" ", "") != fx["to"].replace(" ", ""):
            errors.append(f"виправлення змінює не лише пробіли: {fx['id']}, {fx['field']}")
        text_fixes.setdefault(fx["id"], []).append(fx)

    def fix_spaces(qid: str, field: str, s: str) -> str:
        for fx in text_fixes.get(qid, []):
            if fx["field"] != field:
                continue
            if s.count(fx["from"]) != 1:
                errors.append(f"виправлення не знайдено один раз: {qid}, {field}: {fx['from']}")
            s = s.replace(fx["from"], fx["to"])
            fx["used"] = True
        return s

    # 2. Набір для застосунку.
    topics = []
    used_images = []
    for sec in questions["sections"]:
        if sec["id"] not in ALL_SECTION_IDS:
            continue
        num = sec["number"]
        out_q = []
        for q in sec["questions"]:
            ans = merged.get(num, {}).get(str(q["n"]))
            if ans is None:
                errors.append(f"немає узгодженої відповіді: розділ {num}, питання {q['n']}")
                continue
            if not 1 <= ans <= len(q["options"]):
                errors.append(f"відповідь поза межами: розділ {num}, питання {q['n']}")
                continue
            item = {
                "id": f"{num}-{q['n']}",
                "n": q["n"],
                "text": fix_spaces(f"{num}-{q['n']}", "text", q["text"]),
                "options": [fix_spaces(f"{num}-{q['n']}", f"option {i}", o) for i, o in enumerate(q["options"], 1)],
                "correct": ans - 1,  # індекс з нуля
                "images": q.get("images", []),
            }
            if q.get("image_captions"):
                item["imageCaptions"] = q["image_captions"]
            if item["id"] in explanations:
                e = explanations.pop(item["id"])
                item["explanation"] = {"text": e["text"], "refs": e["refs"]}
                if e.get("outdated"):
                    item["explanation"]["outdated"] = True
            used_images.extend(item["images"])
            out_q.append(item)
        topics.append({"id": num, "title": sec["title"], "block": exam_block(sec["id"], sec["title"]), "questions": out_q, "_sec": sec["id"]})

    errors.extend(f"пояснення до невідомого питання: {k}" for k in explanations)
    errors.extend(f"виправлення до невідомого питання чи поля: {fx['id']}, {fx['field']}"
                  for fxs in text_fixes.values() for fx in fxs if not fx.get("used"))
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1

    img_out = PUBLIC / "img"
    if img_out.exists():
        shutil.rmtree(img_out)
    img_out.mkdir(parents=True)
    # Картинки стискаємо у WebP для швидкого завантаження й офлайн-кешу.
    # Оригінали лишаються в data/images/. Малі зображення не збільшуємо.
    from PIL import Image  # імпорт тут, щоб решта скрипта працювала без Pillow

    renamed = {}
    for name in used_images:
        out_name = Path(name).with_suffix(".webp").name
        with Image.open(DATA / "images" / name) as im:
            im = im.convert("RGBA" if "A" in im.getbands() or im.mode == "P" else "RGB")
            if im.width > MAX_IMAGE_WIDTH:
                h = round(im.height * MAX_IMAGE_WIDTH / im.width)
                im = im.resize((MAX_IMAGE_WIDTH, h), Image.LANCZOS)
            im.save(img_out / out_name, "WEBP", quality=WEBP_QUALITY, method=6)
        renamed[name] = out_name
    for t in topics:
        for q in t["questions"]:
            q["images"] = [renamed[n] for n in q["images"]]
    used_images = list(renamed.values())

    (PUBLIC / "data").mkdir(parents=True, exist_ok=True)
    sec_ids = [t.pop("_sec") for t in topics]
    categories = [
        {
            "id": c["id"],
            "title": c["title"],
            "topicIds": [t["id"] for t, sid in zip(topics, sec_ids) if sid in GENERAL_SECTION_IDS | c["extra"]],
        }
        for c in CATEGORIES
    ]
    dump = lambda obj: json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    # Усі категорії одним файлом: загальні розділи не дублюються.
    (PUBLIC / "data" / "questions.json").write_text(
        dump({"order": questions["source"]["order"], "examBlocks": EXAM_BLOCKS, "categories": categories, "topics": topics}),
        encoding="utf-8",
    )
    by_id = {t["id"]: len(t["questions"]) for t in topics}
    for c in categories:
        print(f"категорія {c['title']}: тем {len(c['topicIds'])}, питань {sum(by_id[i] for i in c['topicIds'])}")

    total = sum(len(t["questions"]) for t in topics)
    size = sum((img_out / n).stat().st_size for n in used_images) / 1e6
    print(f"тем: {len(topics)}, питань: {total}, картинок: {len(used_images)} ({size:.1f} МБ)")
    print(f"пояснень: {sum(1 for t in topics for q in t['questions'] if 'explanation' in q)}")
    print(f"розбіжностей між проходами (усі розділи): {len(disputed)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
