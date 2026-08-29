import os
from dotenv import load_dotenv
from google import genai
from supabase import create_client, Client

load_dotenv()

genai_client = genai.Client()

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(supabase_url, supabase_key)