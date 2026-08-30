import os
from dotenv import load_dotenv
from supabase import create_client, Client
import itertools

load_dotenv()

gemini_keys = [k.strip() for k in os.getenv("GEMINI_API_KEYS", "").split(",") if k.strip()]
gemini_key_cycle = itertools.cycle(gemini_keys)

groq_keys = [k.strip() for k in os.getenv("GROQ_API_KEYS", "").split(",") if k.strip()]
groq_key_cycle = itertools.cycle(groq_keys)

openrouter_keys = [k.strip() for k in os.getenv("OPENROUTER_API_KEYS", "").split(",") if k.strip()]
openrouter_key_cycle = itertools.cycle(openrouter_keys)

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(supabase_url, supabase_key)

supabase_service_key = os.getenv("SUPABASE_SERVICE_KEY")
supabase_admin: Client = create_client(supabase_url, supabase_service_key) if supabase_service_key else supabase