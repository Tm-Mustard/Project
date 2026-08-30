from google import genai
from google.genai import types
import json

from clients import gemini_keys, gemini_key_cycle, supabase_admin


async def run_extraction(image_path: str, model_name: str, document_id: str, user_id: str):
    try:
        file_bytes = supabase_admin.storage.from_("images").download(image_path)

        prompt = """Extract all fields from this document and return ONLY valid JSON.
Structure: {"document_quality": "clear|partial|unreadable", "fields": {...extracted key-value pairs...}, "field_confidences": {...same keys, confidence 0-1...}}"""

        if model_name != "gemini":
            return {"status": "extraction_failed", "message": f"Model '{model_name}' not yet supported"}

        parsed = None
        last_error = None
        tried_keys = set()

        while len(tried_keys) < len(gemini_keys):
            key = next(gemini_key_cycle)
            if key in tried_keys:
                continue
            tried_keys.add(key)

            try:
                client = genai.Client(api_key=key)
                response = client.models.generate_content(
                    model="gemini-3.6-flash",
                    contents=[
                        prompt,
                        types.Part.from_bytes(data=file_bytes, mime_type="image/jpeg"),
                    ],
                    config=types.GenerateContentConfig(response_mime_type="application/json")
                )
                parsed = json.loads(response.text)
                break
            except Exception as e:
                last_error = e
                continue

        if parsed is None:
            return {"status": "extraction_failed", "message": f"All API keys exhausted: {last_error}"}

        quality = parsed.get("document_quality", "clear")
        fields = parsed.get("fields", {})
        confidences = parsed.get("field_confidences", {})

        if quality == "unreadable":
            return {"status": "rejected", "reason": "Document image is too unclear to process reliably or it may not contain any text"}

        return {
            "status": "on_review",
            "extracted_json": fields,
            "field_confidences": confidences,
        }

    except Exception as e:
        return {"status": "extraction_failed", "message": str(e)}