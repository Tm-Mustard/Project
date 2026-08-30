import os
from dotenv import load_dotenv
from google import genai
from supabase import create_client, Client
import itertools

load_dotenv()

gemini_keys = [k.strip() for k in os.getenv("GEMINI_API_KEYS", "").split(",") if k.strip()]
gemini_key_cycle = itertools.cycle(gemini_keys)

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(supabase_url, supabase_key)

supabase_service_key = os.getenv("SUPABASE_SERVICE_KEY")
supabase_admin: Client = create_client(supabase_url, supabase_service_key) if supabase_service_key else supabase