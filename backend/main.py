from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from extraction import run_extraction
from auth import verify_user

app = FastAPI()

origins = [
    "https://www.openlens.space",
    "https://openlens.space",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def status():
    return {"Status": "Connected"}


@app.post("/imgpip")
async def process_img(request: Request):
    user_id, err = verify_user(request)
    if err:
        return err

    try:
        data = await request.json()
        document_id = data.get("document_id")
        model_name = data.get("model")
        image_path = data.get("image_path")

        if not image_path:
            return {"status": "extraction_failed", 
                    "message": "image_path is required"}
        if not model_name:
            return {"status": "extraction_failed", 
                    "message": "model is required"}
        if not document_id:
            return {"status": "extraction_failed", 
                    "message": "document_id is required"}

        result = await run_extraction(image_path, model_name, document_id, user_id)
        return result

    except Exception as e:
        return {"status": "extraction_failed", 
                "message": str(e)}