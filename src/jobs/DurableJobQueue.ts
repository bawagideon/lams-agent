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
  private jobs: Map<string, AgentJob> = new Map();
  private supabase: SupabaseClient | null = null;
  private hasSupabaseTable: boolean = false;

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
        this.supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
      } catch (err: any) {
        console.warn(`[DurableJobQueue] Supabase client init error: ${err.message}`);
      }
    }
  }

  public static getInstance(): DurableJobQueue {
    if (!DurableJobQueue.instance) {
      DurableJobQueue.instance = new DurableJobQueue();
    }
    return DurableJobQueue.instance;
  }

  private loadFromFile(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const items: AgentJob[] = JSON.parse(raw);
        items.forEach(job => this.jobs.set(job.id, job));
      }
    } catch (err: any) {
      console.warn(`[DurableJobQueue] Error reading local jobs: ${err.message}`);
    }
  }

  private persist(): void {
    try {
      const dataDir = path.dirname(this.filePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const array = Array.from(this.jobs.values());
      fs.writeFileSync(this.filePath, JSON.stringify(array, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn(`[DurableJobQueue] Error writing local jobs: ${err.message}`);
    }
  }

  /**
   * Enqueues a new job with idempotency key deduplication.
   */
  public async enqueue(
    type: JobType,
    payload: Record<string, any>,
    idempotencyKey?: string
  ): Promise<AgentJob> {
    // 1. Idempotency check
    if (idempotencyKey) {
      for (const existing of this.jobs.values()) {
        if (existing.idempotencyKey === idempotencyKey) {
          // If already in flight or done, return existing
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

    this.jobs.set(id, job);
    this.persist();

    // Optionally sync to Supabase if table exists
    if (this.supabase && this.hasSupabaseTable) {
      try {
        await this.supabase.from('agent_jobs').insert({
          id: job.id,
          idempotency_key: job.idempotencyKey,
          job_type: job.type,
          status: job.status,
          payload: job.payload,
          created_at: job.createdAt,
          updated_at: job.updatedAt,
        });
      } catch {
        // Table not ready; local store is durable
      }
    }

    return job;
  }

  /**
   * Claims the next available pending job matching supported types.
   * Also re-claims abandoned jobs whose heartbeats have expired (> 2 mins).
   */
  public async claimNext(
    workerId: string,
    supportedTypes: JobType[]
  ): Promise<AgentJob | null> {
    const now = Date.now();
    const staleThreshold = now - 2 * 60 * 1000; // 2 minutes

    for (const job of this.jobs.values()) {
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
        this.persist();
        return { ...job };
      }
    }

    return null;
  }

  /**
   * Updates worker heartbeat while a job is running.
   */
  public async heartbeat(jobId: string, workerId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.claimedBy !== workerId) return false;

    job.status = 'RUNNING';
    job.heartbeatAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();
    this.persist();
    return true;
  }

  /**
   * Marks a job as completed with its resulting data.
   */
  public async complete(jobId: string, workerId: string, result: any): Promise<AgentJob> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    job.status = 'COMPLETED';
    job.claimedBy = workerId;
    job.result = result;
    job.updatedAt = new Date().toISOString();
    this.persist();

    return { ...job };
  }

  /**
   * Marks a job as failed with an error message.
   */
  public async fail(jobId: string, workerId: string, errorMessage: string): Promise<AgentJob> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    job.status = 'FAILED';
    job.claimedBy = workerId;
    job.error = errorMessage;
    job.updatedAt = new Date().toISOString();
    this.persist();

    return { ...job };
  }

  /**
   * Retrieves a job by ID.
   */
  public getJob(jobId: string): AgentJob | null {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : null;
  }

  /**
   * Lists all jobs with optional status filter.
   */
  public listJobs(status?: JobStatus): AgentJob[] {
    const all = Array.from(this.jobs.values());
    if (status) {
      return all.filter(j => j.status === status);
    }
    return all.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }
}
