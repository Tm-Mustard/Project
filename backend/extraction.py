from google.genai import types
import json
from clients import genai_client, supabase


async def run_extraction(image_path: str, model_name: str, document_id: str, user_id: str):
    try:
        file_bytes = supabase.storage.from_("images").download(image_path)

        prompt = """Extract all fields from this document and return ONLY valid JSON,
no markdown formatting, no explanation, no code fences.
Structure: {"document_quality": "clear|partial|unreadable", "fields": {...extracted key-value pairs...}, "field_confidences": {...same keys, confidence 0-1...}}"""

        if model_name == "gemini":
            response = genai_client.models.generate_content(
                model="gemini-3.6-flash",
                contents=[
                    prompt,
                    types.Part.from_bytes(data=file_bytes, mime_type="image/jpeg"),
                ],
            )
            raw_text = response.text.strip()
        else:
            return {"status": "extraction_failed", 
                    "message": f"Model '{model_name}' not yet supported"}

        if raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]
            raw_text = raw_text.strip()

        try:
            parsed = json.loads(raw_text)
        except json.JSONDecodeError:
            return {"status": "extraction_failed", 
                    "message": "Could not parse model response"}

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