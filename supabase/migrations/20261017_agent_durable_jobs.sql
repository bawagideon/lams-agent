-- Migration: Durable Job Queue and Persisted Approvals for LAMS HQ
-- Run this in Supabase SQL Editor if you wish to host the queue in Supabase alongside episodes.

CREATE TABLE IF NOT EXISTS public.agent_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error_message TEXT,
  claimed_by TEXT,
  heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_jobs_status ON public.agent_jobs (status, job_type);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_idempotency ON public.agent_jobs (idempotency_key);

CREATE TABLE IF NOT EXISTS public.agent_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id TEXT NOT NULL,
  title TEXT NOT NULL,
  video_file_path TEXT NOT NULL,
  video_size_bytes BIGINT NOT NULL,
  video_fingerprint TEXT NOT NULL,
  channel_title TEXT NOT NULL,
  publish_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PENDING',
  approval_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_approvals_token ON public.agent_approvals (approval_token);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_episode ON public.agent_approvals (episode_id);
