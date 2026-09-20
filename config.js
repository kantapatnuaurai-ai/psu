const SUPABASE_URL = "https://zafiaqmilgmhmlyynwkp.supabase.co";   // วาง Project URL
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphZmlhcW1pbGdtaG1seXlud2twIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDE4ODUsImV4cCI6MjEwNTQ3Nzg4NX0.sfMwebLkL8k5B8GK_n_jes2yCLcWBLDorqdk_Wgwm8g";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);