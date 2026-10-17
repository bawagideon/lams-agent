import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/env.ts';

export type JobType = 'capcut_draft' | 'ffmpeg_render' | 'media_download' | 'youtube_publish';
export type JobStatus = 'PENDING' | 'CLAIMED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface AgentJob {
  id: string;
  idempotencyKey?: string;
  type: JobType;
  status: JobStatus;
  payload: Record<string, any>;
  result?: any;
  error?: string;
  claimedBy?: string;
  heartbeatAt?: string;
  createdAt: string;
  updatedAt: string;
}

export class DurableJobQueue {
  private static instance: DurableJobQueue;
  private filePath: string;
  private localJobs: Map<string, AgentJob> = new Map();
  private supabase: SupabaseClient | null = null;
  private isSupabaseAuthoritative: boolean = false;
  private initPromise: Promise<void>;

  private constructor() {
    const dataDir = path.resolve('data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch {}
    }
    this.filePath = path.join(dataDir, 'durable_jobs.json');
    this.loadFromFile();

    if (config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        this.supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false },
        });
      } catch (err: any) {
        console.warn(`[DurableJobQueue] Supabase client init error: ${err.message}`);
      }
    }

    this.initPromise = this.checkSupabaseSchema();
  }

  public static getInstance(): DurableJobQueue {
    if (!DurableJobQueue.instance) {
      DurableJobQueue.instance = new DurableJobQueue();
    }
    return DurableJobQueue.instance;
  }

  public async ready(): Promise<void> {
    await this.initPromise;
  }

  private async checkSupabaseSchema(): Promise<void> {
    if (!this.supabase) {
      const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
      if (isProduction) {
        console.error('[DurableJobQueue] FATAL: Production queue requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
      }
      return;
    }

    try {
      const { data, error } = await this.supabase
        .from('agent_jobs')
        .select('id')
        .limit(1);

      if (!error) {
        this.isSupabaseAuthoritative = true;
        console.log('[DurableJobQueue] Connected to authoritative Supabase agent_jobs table.');
      } else {
        console.warn(`[DurableJobQueue] Supabase agent_jobs table query error (${error.message}). Using local durable fallback.`);
      }
    } catch (err: any) {
      console.warn(`[DurableJobQueue] Supabase connectivity check error: ${err.message}`);
    }
  }

  private loadFromFile(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const items: AgentJob[] = JSON.parse(raw);
        items.forEach(job => this.localJobs.set(job.id, job));
      }
    } catch (err: any) {
      console.warn(`[DurableJobQueue] Error reading local jobs: ${err.message}`);
    }
  }

  private persistOrThrow(): void {
    const dataDir = path.dirname(this.filePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const array = Array.from(this.localJobs.values());
    fs.writeFileSync(this.filePath, JSON.stringify(array, null, 2), 'utf-8');
  }

  /**
   * Enqueues a job with database-enforced idempotency deduplication.
   */
  public async enqueue(
    type: JobType,
    payload: Record<string, any>,
    idempotencyKey?: string
  ): Promise<AgentJob> {
    await this.initPromise;

    if (this.isSupabaseAuthoritative && this.supabase) {
      // 1. Check existing if idempotency key is provided
      if (idempotencyKey) {
        const { data: existing } = await this.supabase
          .from('agent_jobs')
          .select('*')
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle();

        if (existing) {
          return {
            id: existing.id,
            idempotencyKey: existing.idempotency_key,
            type: existing.job_type as JobType,
            status: existing.status as JobStatus,
            payload: existing.payload,
            result: existing.result,
            error: existing.error_message,
            claimedBy: existing.claimed_by,
            heartbeatAt: existing.heartbeat_at,
            createdAt: existing.created_at,
            updatedAt: existing.updated_at,
          };
        }
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      const { data: inserted, error } = await this.supabase
        .from('agent_jobs')
        .insert({
          id,
          idempotency_key: idempotencyKey,
          job_type: type,
          status: 'PENDING',
          payload,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (error) {
        // If conflict error on idempotency_key, fetch again
        if (idempotencyKey && error.message.includes('unique constraint')) {
          const { data: conflictRow } = await this.supabase
            .from('agent_jobs')
            .select('*')
            .eq('idempotency_key', idempotencyKey)
            .single();
          if (conflictRow) {
            return {
              id: conflictRow.id,
              idempotencyKey: conflictRow.idempotency_key,
              type: conflictRow.job_type,
              status: conflictRow.status,
              payload: conflictRow.payload,
              createdAt: conflictRow.created_at,
              updatedAt: conflictRow.updated_at,
            };
          }
        }
        throw new Error(`Failed to enqueue job in Supabase: ${error.message}`);
      }

      return {
        id: inserted.id,
        idempotencyKey: inserted.idempotency_key,
        type: inserted.job_type as JobType,
        status: inserted.status as JobStatus,
        payload: inserted.payload,
        createdAt: inserted.created_at,
        updatedAt: inserted.updated_at,
      };
    }

    // Local durable fallback
    if (idempotencyKey) {
      for (const existing of this.localJobs.values()) {
        if (existing.idempotencyKey === idempotencyKey) {
          return existing;
        }
      }
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const job: AgentJob = {
      id,
      idempotencyKey,
      type,
      status: 'PENDING',
      payload,
      createdAt: now,
      updatedAt: now,
    };

    this.localJobs.set(id, job);
    this.persistOrThrow();
    return job;
  }

  /**
   * Atomically claims the next available job using conditional database update.
   */
  public async claimNext(
    workerId: string,
    supportedTypes: JobType[]
  ): Promise<AgentJob | null> {
    await this.initPromise;
    const now = Date.now();
    const staleThresholdIso = new Date(now - 2 * 60 * 1000).toISOString(); // 2-minute stale threshold

    if (this.isSupabaseAuthoritative && this.supabase) {
      // Find candidate job
      const { data: candidates, error: findErr } = await this.supabase
        .from('agent_jobs')
        .select('*')
        .in('job_type', supportedTypes)
        .or(`status.eq.PENDING,and(status.eq.CLAIMED,heartbeat_at.lt.${staleThresholdIso}),and(status.eq.RUNNING,heartbeat_at.lt.${staleThresholdIso})`)
        .order('created_at', { ascending: true })
        .limit(3);

      if (findErr || !candidates || candidates.length === 0) {
        return null;
      }

      for (const candidate of candidates) {
        const claimNow = new Date().toISOString();
        // Atomic conditional update
        const { data: claimedRows, error: claimErr } = await this.supabase
          .from('agent_jobs')
          .update({
            status: 'CLAIMED',
            claimed_by: workerId,
            heartbeat_at: claimNow,
            updated_at: claimNow,
          })
          .eq('id', candidate.id)
          .eq('status', candidate.status)
          .select();

        if (!claimErr && claimedRows && claimedRows.length > 0) {
          const claimed = claimedRows[0];
          return {
            id: claimed.id,
            idempotencyKey: claimed.idempotency_key,
            type: claimed.job_type as JobType,
            status: 'CLAIMED',
            payload: claimed.payload,
            claimedBy: claimed.claimed_by,
            heartbeatAt: claimed.heartbeat_at,
            createdAt: claimed.created_at,
            updatedAt: claimed.updated_at,
          };
        }
      }
      return null;
    }

    // Local durable fallback
    const staleThreshold = now - 2 * 60 * 1000;
    for (const job of this.localJobs.values()) {
      if (!supportedTypes.includes(job.type)) continue;

      const isPending = job.status === 'PENDING';
      const isStale = (job.status === 'CLAIMED' || job.status === 'RUNNING') &&
        job.heartbeatAt &&
        Date.parse(job.heartbeatAt) < staleThreshold;

      if (isPending || isStale) {
        job.status = 'CLAIMED';
        job.claimedBy = workerId;
        job.heartbeatAt = new Date(now).toISOString();
        job.updatedAt = new Date(now).toISOString();
        this.persistOrThrow();
        return { ...job };
      }
    }

    return null;
  }

  /**
   * Updates worker heartbeat with worker lease ownership check.
   */
  public async heartbeat(jobId: string, workerId: string): Promise<boolean> {
    await this.initPromise;
    const nowIso = new Date().toISOString();

    if (this.isSupabaseAuthoritative && this.supabase) {
      const { data, error } = await this.supabase
        .from('agent_jobs')
        .update({
          status: 'RUNNING',
          heartbeat_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', jobId)
        .eq('claimed_by', workerId)
        .select();

      return !error && !!data && data.length > 0;
    }

    const job = this.localJobs.get(jobId);
    if (!job || job.claimedBy !== workerId) return false;

    job.status = 'RUNNING';
    job.heartbeatAt = nowIso;
    job.updatedAt = nowIso;
    this.persistOrThrow();
    return true;
  }

  /**
   * Marks a job completed with worker lease ownership check.
   */
  public async complete(jobId: string, workerId: string, result: any): Promise<AgentJob> {
    await this.initPromise;
    const nowIso = new Date().toISOString();

    if (this.isSupabaseAuthoritative && this.supabase) {
      const { data, error } = await this.supabase
        .from('agent_jobs')
        .update({
          status: 'COMPLETED',
          result,
          updated_at: nowIso,
        })
        .eq('id', jobId)
        .eq('claimed_by', workerId)
        .select();

      if (error || !data || data.length === 0) {
        throw new Error(`Failed to complete job ${jobId}: Lease ownership lost or job already terminated.`);
      }

      const row = data[0];
      return {
        id: row.id,
        idempotencyKey: row.idempotency_key,
        type: row.job_type as JobType,
        status: 'COMPLETED',
        payload: row.payload,
        result: row.result,
        claimedBy: row.claimed_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }

    const job = this.localJobs.get(jobId);
    if (!job || job.claimedBy !== workerId) {
      throw new Error(`Failed to complete job ${jobId}: Worker '${workerId}' does not own active lease.`);
    }

    job.status = 'COMPLETED';
    job.result = result;
    job.updatedAt = nowIso;
    this.persistOrThrow();
    return { ...job };
  }

  /**
   * Marks a job failed with worker lease ownership check.
   */
  public async fail(jobId: string, workerId: string, errorMessage: string): Promise<AgentJob> {
    await this.initPromise;
    const nowIso = new Date().toISOString();

    if (this.isSupabaseAuthoritative && this.supabase) {
      const { data, error } = await this.supabase
        .from('agent_jobs')
        .update({
          status: 'FAILED',
          error_message: errorMessage,
          updated_at: nowIso,
        })
        .eq('id', jobId)
        .eq('claimed_by', workerId)
        .select();

      if (error || !data || data.length === 0) {
        throw new Error(`Failed to fail job ${jobId}: Lease ownership lost.`);
      }

      const row = data[0];
      return {
        id: row.id,
        idempotencyKey: row.idempotency_key,
        type: row.job_type as JobType,
        status: 'FAILED',
        payload: row.payload,
        error: row.error_message,
        claimedBy: row.claimed_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }

    const job = this.localJobs.get(jobId);
    if (!job || job.claimedBy !== workerId) {
      throw new Error(`Failed to report failure for job ${jobId}: Worker '${workerId}' does not own active lease.`);
    }

    job.status = 'FAILED';
    job.error = errorMessage;
    job.updatedAt = nowIso;
    this.persistOrThrow();
    return { ...job };
  }

  public getJob(jobId: string): AgentJob | null {
    const job = this.localJobs.get(jobId);
    return job ? { ...job } : null;
  }

  public listJobs(status?: JobStatus): AgentJob[] {
    const all = Array.from(this.localJobs.values());
    if (status) {
      return all.filter(j => j.status === status);
    }
    return all.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }
}
