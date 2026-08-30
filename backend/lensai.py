from google import genai
from google.genai import types
import json
from clients import gemini_keys, gemini_key_cycle

SYSTEM_PROMPT = """You are LensAI, a sharp document-analysis assistant.
You answer questions using the extracted document data AND the conversation history provided.
Rules:
- Use the extracted document fields as your primary source of truth.
- Use the conversation history to answer follow-up questions and references like what did I say before or what was my previous question.
- Be concise but accurate.
- If neither the document data nor the conversation history contains the answer, say so clearly.
- For math, comparisons, or summaries, show brief reasoning then the final answer.
- Do not hallucinate information not present in the extracted data or conversation history.
- Do not use quotation marks anywhere in your reply."""

def ask_question(question: str, context: dict, document_id: str = ""):
    context_str = json.dumps(context, indent=2, ensure_ascii=False)
    user_prompt = f"""Extracted document fields:
{context_str}

User question: {question}
Answer based strictly on the extracted fields above."""

    tried_keys = set()
    last_error = None

    while len(tried_keys) < len(gemini_keys):
        key = next(gemini_key_cycle)
        if key in tried_keys:
            continue
        tried_keys.add(key)
        try:
            client = genai.Client(api_key=key)
            chat = client.chats.create(
                model="gemini-3.6-flash",
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    temperature=0.3,
                    max_output_tokens=2048,
                ),
            )
            response = chat.send_message(user_prompt)
            answer = response.text.strip()
            return {"answer": answer}
        except Exception as e:
            last_error = e
            continue

    return {"error": f"All Gemini API keys exhausted: {last_error}"}