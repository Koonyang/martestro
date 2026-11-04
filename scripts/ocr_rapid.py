#!/usr/bin/env python3
# 탑마트 전단 OCR (무료 · RapidOCR = PaddleOCR PP-OCRv5 한국어 모델을 onnxruntime 으로 실행)
# 사용: python3 scripts/ocr_rapid.py 전단1.webp 전단2.webp ...  → 표준출력 JSON {파일: [보통 해상도 결과, 원본 해상도 결과]}
#   결과 = [[글자, [[x,y]×4], 확신도], ...]. 두 해상도로 읽어 서로 맞춰 보면(topmart.js) 잘못 읽은 가격을 많이 걸러요.
# 모델 파일(약 15MB)은 OCR_MODEL_DIR(기본 ~/.cache/martestro-ocr)에 두고 다시 써요(GitHub Actions 캐시).
import sys, os, json, shutil
from rapidocr import RapidOCR, LangRec, OCRVersion, ModelType
import rapidocr

MD = os.environ.get('OCR_MODEL_DIR') or os.path.expanduser('~/.cache/martestro-ocr')
os.makedirs(MD, exist_ok=True)
DET, REC, CLS = "ch_PP-OCRv5_det_mobile.onnx", "korean_PP-OCRv5_rec_mobile.onnx", "ch_ppocr_mobile_v2.0_cls_mobile.onnx"

def engine(max_side):
    p = {"Global.max_side_len": max_side, "Global.use_cls": True, "Global.log_level": "error",
         "Det.ocr_version": OCRVersion.PPOCRV5, "Det.model_type": ModelType.MOBILE,
         "Rec.lang_type": LangRec.KOREAN, "Rec.ocr_version": OCRVersion.PPOCRV5, "Rec.model_type": ModelType.MOBILE}
    if os.path.exists(os.path.join(MD, DET)) and os.path.exists(os.path.join(MD, REC)) and os.path.exists(os.path.join(MD, CLS)):
        p["Det.model_path"] = os.path.join(MD, DET); p["Rec.model_path"] = os.path.join(MD, REC); p["Cls.model_path"] = os.path.join(MD, CLS)
    return RapidOCR(params=p)

def keep_models():
    src = os.path.join(os.path.dirname(rapidocr.__file__), 'models')
    for f in (DET, REC, CLS):
        a, b = os.path.join(src, f), os.path.join(MD, f)
        if os.path.exists(a) and not os.path.exists(b): shutil.copy(a, b)

def run(eng, f):
    r = eng(f)
    if r.boxes is None: return []
    return [[t, [[float(x), float(y)] for x, y in b], float(s)] for b, t, s in zip(r.boxes, r.txts, r.scores)]

engs = [engine(2000), engine(4000)]
keep_models()
out = {f: [run(e, f) for e in engs] for f in sys.argv[1:]}
json.dump(out, sys.stdout, ensure_ascii=False)
