from google import genai
from google.genai import types
import json
from clients import gemini_keys, gemini_key_cycle

PROMPT = """Extract all fields from this document and return ONLY valid JSON.
Structure: {"document_quality": "clear|partial|unreadable", "fields": {...extracted key-value pairs...}, "field_confidences": {...same keys, confidence 0-1...}}"""


def run(image_bytes: bytes):
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
                    PROMPT,
                    types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                ],
                config=types.GenerateContentConfig(response_mime_type="application/json")
            )

            raw_text = response.text
            if raw_text is None:
                last_error = Exception("Gemini returned empty/blocked response (text is None)")
                continue

            parsed = json.loads(raw_text)

            # CRITICAL FIX: Ensure parsed is a dict, not None or a list/string
            if not isinstance(parsed, dict):
                last_error = Exception(f"Gemini returned non-dict JSON: {parsed}")
                parsed = None
                continue

            break

        except Exception as e:
            last_error = e
            continue

    return parsed, last_error