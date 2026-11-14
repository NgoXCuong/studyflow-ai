"""Local, page-by-page OCR for PDFs without a text layer."""

import math
import time
from contextlib import closing
from pathlib import Path

import pypdfium2 as pdfium
from tesserocr import OEM, PSM, PyTessBaseAPI

from app.core.config import get_settings
from app.services.embeddings import EmbeddingError


def open_ocr_engine():
    settings = get_settings()
    directory = settings.ocr_tessdata_dir
    if not directory.is_absolute():
        directory = Path(__file__).resolve().parents[2] / directory
    if any(not (directory / f"{language}.traineddata").is_file()
           for language in settings.ocr_languages.split("+")):
        raise EmbeddingError("ocr_not_configured", "Thiếu dữ liệu ngôn ngữ OCR. Cần cài dữ liệu OCR_LANGUAGES vào OCR_TESSDATA_DIR trên worker rồi thử xử lý lại.")
    try:
        return PyTessBaseAPI(path=str(directory), lang=settings.ocr_languages, oem=OEM.LSTM_ONLY, psm=PSM.AUTO)
    except RuntimeError as exc:
        raise EmbeddingError("ocr_not_configured", "Không khởi tạo được OCR. Kiểm tra bộ dữ liệu ngôn ngữ trên worker rồi thử xử lý lại.") from exc


def ocr_page(document, page_index, engine):
    try:
        with closing(document[page_index]) as page:
            width, height = page.get_size()
            if not all(math.isfinite(value) and value > 0 for value in (width, height)):
                raise EmbeddingError("invalid_pdf", "Kích thước trang PDF không hợp lệ để OCR.")
            # Bound the raster allocation for unusually large PDF page dimensions.
            scale = min(200 / 72, math.sqrt(16_000_000 / (width * height)), 10_000 / max(width, height))
            with closing(page.render(scale=scale)) as bitmap, bitmap.to_pil() as image:
                engine.SetImage(image)
                started = time.monotonic()
                if not engine.Recognize(timeout=get_settings().ocr_timeout_seconds * 1000):
                    if time.monotonic() - started >= get_settings().ocr_timeout_seconds:
                        raise EmbeddingError("ocr_timeout", "OCR trang PDF vượt thời gian cho phép. Hãy chia nhỏ hoặc cải thiện chất lượng bản scan rồi thử lại.")
                    raise EmbeddingError("ocr_failed", "Không nhận dạng được trang PDF. Vui lòng kiểm tra chất lượng bản scan hoặc xuất lại file.")
                return engine.GetUTF8Text()
    except (pdfium.PdfiumError, RuntimeError, OSError, ValueError) as exc:
        raise EmbeddingError("ocr_failed", "Không nhận dạng được trang PDF. Vui lòng kiểm tra chất lượng bản scan hoặc xuất lại file.") from exc
    finally:
        engine.Clear()
