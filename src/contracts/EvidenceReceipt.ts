import crypto from 'node:crypto';

export interface StepEvidence {
  step: number;
  name: string;
  action: string;
  durationMs: number;
  status: 'PASS' | 'FAIL';
  detail?: string;
}

export interface EvidenceReceipt {
  receiptId: string;
  missionId: string;
  skillId: string;
  skillVersion: string;
  planHash?: string;
  passedPostconditions?: string[];
  executedBy: string; // e.g. "Publisher Agent v1"
  status: 'SUCCESS' | 'FAILED' | 'REQUIRES_REVIEW';
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
  steps: StepEvidence[];
  proofData: Record<string, any>;
  signature: string;
}

export function generateEvidenceReceipt(
  missionId: string,
  skillId: string,
  skillVersion: string,
  executedBy: string,
  status: 'SUCCESS' | 'FAILED' | 'REQUIRES_REVIEW',
  startedAt: string,
  steps: StepEvidence[],
  proofData: Record<string, any>,
  extra?: { planHash?: string; passedPostconditions?: string[] }
): EvidenceReceipt {
  const receiptId = `rcpt_${crypto.randomUUID()}`;
  const completedAt = new Date().toISOString();
  const totalDurationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const planHash = extra?.planHash;
  const passedPostconditions = extra?.passedPostconditions;

  const payload = JSON.stringify({
    receiptId,
    missionId,
    skillId,
    skillVersion,
    planHash,
    passedPostconditions,
    executedBy,
    status,
    startedAt,
    completedAt,
    totalDurationMs,
    steps,
    proofData,
  });

  const signature = crypto.createHash('sha256').update(payload).digest('hex');

  return {
    receiptId,
    missionId,
    skillId,
    skillVersion,
    planHash,
    passedPostconditions,
    executedBy,
    status,
    startedAt,
    completedAt,
    totalDurationMs,
    steps,
    proofData,
    signature,
  };
}
