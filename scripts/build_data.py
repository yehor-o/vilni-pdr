"""Збирає дані для застосунку: питання категорії B + правильні відповіді.

Вхід:  data/questions.json, data/answers.A.json, data/answers.B.json, data/images/,
       data/answers.tiebreak.json  (третє читання для клітинок, де A і B розійшлися)
Вихід: data/answers.json            (узгоджені відповіді; null там, де два проходи розійшлися)
       public/data/questions.b.json (те, що читає застосунок)
       public/img/                  (лише картинки питань категорії B)

Запуск: .venv/bin/python -I scripts/build_data.py
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PUBLIC = ROOT / "public"

# Категорія B: загальні розділи 1–39 і додаткові 44–47 (B1, B).
# Припущення за назвами розділів, див. PROJECT_STATE.md.
B_SECTION_IDS = set(range(1, 40)) | {44, 45, 46, 47}

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

    # 2. Набір для застосунку.
    errors = []
    topics = []
    used_images = []
    for sec in questions["sections"]:
        if sec["id"] not in B_SECTION_IDS:
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
                "text": q["text"],
                "options": q["options"],
                "correct": ans - 1,  # індекс з нуля
                "images": q.get("images", []),
            }
            if q.get("image_captions"):
                item["imageCaptions"] = q["image_captions"]
            used_images.extend(item["images"])
            out_q.append(item)
        topics.append({"id": num, "title": sec["title"], "questions": out_q})

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
    (PUBLIC / "data" / "questions.b.json").write_text(
        json.dumps(
            {"order": questions["source"]["order"], "category": "B", "topics": topics},
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    total = sum(len(t["questions"]) for t in topics)
    size = sum((img_out / n).stat().st_size for n in used_images) / 1e6
    print(f"тем: {len(topics)}, питань: {total}, картинок: {len(used_images)} ({size:.1f} МБ)")
    print(f"розбіжностей між проходами (усі розділи): {len(disputed)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
