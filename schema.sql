-- SQL schema to create the 'leads' table in Supabase.
-- This table stores all lead parameters, their calculated lead scores,
-- confidence metrics, and full conversation history.

CREATE TABLE IF NOT EXISTS leads (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  -- Core lead details
  name VARCHAR(255),
  phone VARCHAR(50) UNIQUE, -- Used as the unique constraint for upsert
  phone_verified BOOLEAN DEFAULT FALSE,
  telegram_chat_id VARCHAR(100),
  
  -- Extracted travel parameters
  destination VARCHAR(255),
  budget VARCHAR(100),
  travel_month VARCHAR(100),
  travellers INTEGER,
  
  -- Intent scoring metrics
  lead_score INTEGER DEFAULT 0,
  confidence VARCHAR(50),
  reason TEXT,
  
  -- Full raw payloads for auditability
  raw_extracted_data JSONB,
  conversation_history JSONB
);

-- Enable Row Level Security (RLS) if needed, or create indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_lead_score ON leads(lead_score);
