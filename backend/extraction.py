import asyncio
from clients import supabase_admin
from cvfile import process_image
from models import gemini_model, qwen_model, nemotron_model

MODEL_ROUTER = {
    "gemini": gemini_model.run,
    "qwen": qwen_model.run,
    "nemotron": nemotron_model.run,
}


async def run_extraction(image_path: str, model_name: str, document_id: str, user_id: str):
    try:
        # CRITICAL FIX: Run blocking Supabase + CV operations in a thread
        file_bytes = await asyncio.to_thread(
            lambda: supabase_admin.storage.from_("images").download(image_path)
        )

        preprocess_result = await asyncio.to_thread(process_image, file_bytes)
        if preprocess_result["status"] == "rejected":
            return {"status": "rejected", "reason": preprocess_result["reason"]}

        processed_bytes = preprocess_result["image_bytes"]

        model_fn = MODEL_ROUTER.get(model_name)
        if model_fn is None:
            return {"status": "extraction_failed", "message": f"Model '{model_name}' not supported"}

        # CRITICAL FIX: Run blocking model inference in a thread so it doesn't hang the event loop
        parsed, last_error = await asyncio.to_thread(model_fn, processed_bytes)

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