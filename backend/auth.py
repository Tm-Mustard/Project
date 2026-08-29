from fastapi import Request
from clients import supabase

def verify_user(request: Request):
    
    auth_header = request.headers.get("authorization")

    if not auth_header or not auth_header.startswith("Bearer "):
        return None, {
            "status": "error",
            "message": "Missing or invalid authorization header"
        }

    token = auth_header.removeprefix("Bearer ").strip()

    try:
        user_response = supabase.auth.get_user(token)
    except Exception:
        return None, {
            "status": "error",
            "message": "Invalid or expired token"
        }

    if not user_response or not user_response.user:
        return None, {
            "status": "error",
            "message": "Invalid or expired token"
        }

    return user_response.user.id, None