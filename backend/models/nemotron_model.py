import openai
import base64
import json

from clients import openrouter_keys, openrouter_key_cycle

PROMPT = """Extract all fields from this document and return ONLY valid JSON.
Structure: {"document_quality": "clear|partial|unreadable", "fields": {...extracted key-value pairs...}, "field_confidences": {...same keys, confidence 0-1...}}"""

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
MODEL_NAME = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"


def run(image_bytes: bytes):
    parsed = None
    last_error = None
    tried_keys = set()
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    while len(tried_keys) < len(openrouter_keys):
        key = next(openrouter_key_cycle)
        if key in tried_keys:
            continue
        tried_keys.add(key)

        try:
            client = openai.OpenAI(
                api_key=key,
                base_url=OPENROUTER_BASE_URL,
                default_headers={
                    "HTTP-Referer": "https://openlens.space",
                    "X-Title": "OpenLens",
                },
            )
            response = client.chat.completions.create(
                model=MODEL_NAME,
                response_format={"type": "json_object"},
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": PROMPT},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                        },
                    ],
                }],
            )

            msg = response.choices[0].message

            # CRITICAL FIX: content can be None on OpenRouter free tier
            if msg.content is None:
                last_error = Exception(
                    f"Nemotron returned empty content (refusal/filter). "
                    f"Finish reason: {getattr(msg, 'finish_reason', 'unknown')}"
                )
                continue

            raw_text = msg.content.strip()
            if not raw_text:
                last_error = Exception("Nemotron returned empty text after strip")
                continue

            parsed = json.loads(raw_text)

            # CRITICAL FIX: Ensure parsed is a dict
            if not isinstance(parsed, dict):
                last_error = Exception(f"Nemotron returned non-dict JSON: {parsed}")
                parsed = None
                continue

            break

        except Exception as e:
            last_error = e
            continue

    return parsed, last_error