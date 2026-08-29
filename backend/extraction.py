from google.genai import types
import json
from clients import genai_client, supabase_admin


async def run_extraction(image_path: str, model_name: str, document_id: str, user_id: str):
    try:
        file_bytes = supabase_admin.storage.from_("images").download(image_path)

        prompt = """Extract all fields from this document and return ONLY valid JSON.
Structure: {"document_quality": "clear|partial|unreadable", "fields": {...extracted key-value pairs...}, "field_confidences": {...same keys, confidence 0-1...}}"""

        if model_name == "gemini":
            response = genai_client.models.generate_content(
                model="gemini-3.6-flash",
                contents=[
                    prompt,
                    types.Part.from_bytes(data=file_bytes, mime_type="image/jpeg"),
                ],
                config=types.GenerateContentConfig(response_mime_type="application/json")
            )
            parsed = json.loads(response.text)
        else:
            return {"status": "extraction_failed",
                    "message": f"Model '{model_name}' not yet supported"}

        quality = parsed.get("document_quality", "clear")
        fields = parsed.get("fields", {})
        confidences = parsed.get("field_confidences", {})

        if quality == "unreadable":
            return {"status": "rejected",
                    "reason": "Document image is too unclear to process reliably."}

        return {
            "status": "on_review",
            "extracted_json": fields,
            "field_confidences": confidences,
        }

    except Exception as e:
        return {"status": "extraction_failed",
                "message": str(e)}