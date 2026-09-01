import openai
import base64
import json
import re

from clients import openrouter_keys, openrouter_key_cycle

PROMPT = """Extract all fields from this document and return ONLY valid JSON, with no explanation, no markdown code fences, and no text before or after the JSON object.
Structure: {"document_quality": "clear|partial|unreadable", "fields": {...extracted key-value pairs...}, "field_confidences": {...same keys, confidence 0-1...}}"""

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
MODEL_NAME = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"


def _extract_json(raw_text: str):
    """
    This model does NOT support response_format (per OpenRouter docs), so it
    can return prose, markdown fences, or reasoning text around the JSON.
    Strip fences first, then fall back to grabbing the first {...} block.
    """
    text = raw_text.strip()

    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        return json.loads(match.group(0))

    raise json.JSONDecodeError("No JSON object found in response", text, 0)


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
               
                extra_body={"reasoning": {"enabled": False}},
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

            try:
                parsed = _extract_json(raw_text)
            except json.JSONDecodeError as e:
                last_error = Exception(f"Nemotron did not return parseable JSON: {e}. Raw: {raw_text[:300]}")
                continue

            if not isinstance(parsed, dict):
                last_error = Exception(f"Nemotron returned non-dict JSON: {parsed}")
                parsed = None
                continue

            break

        except Exception as e:
            last_error = e
            continue

    return parsed, last_error
