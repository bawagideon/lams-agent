import crypto from 'node:crypto';
import { AuthManager } from '../auth/AuthManager.ts';

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
  signedAt?: string;
  signedBy?: string;
  signature: string; // HMAC-SHA256 signature
}

/**
 * Deterministically canonicalizes evidence receipt payload for cryptographic signing.
 * All keys are sorted alphabetically and nested objects/arrays are normalized.
 */
export function canonicalizeReceiptPayload(receipt: Omit<EvidenceReceipt, 'signature'> | EvidenceReceipt): string {
  const canonicalObj: Record<string, any> = {
    completedAt: receipt.completedAt,
    executedBy: receipt.executedBy,
    missionId: receipt.missionId,
    passedPostconditions: Array.isArray(receipt.passedPostconditions) ? [...receipt.passedPostconditions].sort() : [],
    planHash: receipt.planHash || '',
    proofData: receipt.proofData || {},
    receiptId: receipt.receiptId,
    signedAt: receipt.signedAt || '',
    signedBy: receipt.signedBy || '',
    skillId: receipt.skillId,
    skillVersion: receipt.skillVersion,
    startedAt: receipt.startedAt,
    status: receipt.status,
    steps: (receipt.steps || []).map((s) => ({
      action: s.action,
      detail: s.detail || '',
      durationMs: s.durationMs,
      name: s.name,
      status: s.status,
      step: s.step,
    })),
    totalDurationMs: receipt.totalDurationMs,
  };

  return JSON.stringify(canonicalObj, Object.keys(canonicalObj).sort());
}

/**
 * Signs an evidence receipt using HMAC-SHA256 with a server-held secret key.
 */
export function signEvidenceReceipt(
  unsignedReceipt: Omit<EvidenceReceipt, 'signature'>,
  secretKey?: string,
  signedBy = 'LAMS_EVIDENCE_AUTHORITY'
): EvidenceReceipt {
  const secret = secretKey || AuthManager.getInstance().getSecret();
  const signedAt = new Date().toISOString();
  const receiptWithSignMeta = {
    ...unsignedReceipt,
    signedAt,
    signedBy,
  };

  const canonicalString = canonicalizeReceiptPayload(receiptWithSignMeta);
  const signature = crypto.createHmac('sha256', secret).update(canonicalString).digest('hex');

  return {
    ...receiptWithSignMeta,
    signature,
  };
}

/**
 * Cryptographically verifies an evidence receipt's HMAC-SHA256 signature.
 * Prevents tampering, forgery, or fabrication of success claims.
 */
export function verifyEvidenceReceipt(
  receipt: any,
  secretKey?: string
): { valid: boolean; error?: string } {
  if (!receipt || typeof receipt !== 'object') {
    return { valid: false, error: 'Evidence receipt is missing or not an object.' };
  }

  if (!receipt.signature || typeof receipt.signature !== 'string') {
    return { valid: false, error: 'Evidence receipt is missing required HMAC signature.' };
  }

  if (!receipt.receiptId || !receipt.skillId || !receipt.skillVersion || !receipt.status) {
    return { valid: false, error: 'Evidence receipt is missing mandatory metadata fields.' };
  }

  const secret = secretKey || AuthManager.getInstance().getSecret();
  const expectedCanonical = canonicalizeReceiptPayload(receipt);
  const expectedSig = crypto.createHmac('sha256', secret).update(expectedCanonical).digest('hex');

  const providedSig = receipt.signature;
  if (
    providedSig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(Buffer.from(providedSig, 'hex'), Buffer.from(expectedSig, 'hex'))
  ) {
    return {
      valid: false,
      error: 'Evidence receipt HMAC signature is invalid, forged, or payload was tampered.',
    };
  }

  return { valid: true };
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
  extra?: { planHash?: string; passedPostconditions?: string[]; secretKey?: string }
): EvidenceReceipt {
  const receiptId = `rcpt_${crypto.randomUUID()}`;
  const completedAt = new Date().toISOString();
  const totalDurationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const planHash = extra?.planHash;
  const passedPostconditions = extra?.passedPostconditions;

  const unsignedReceipt: Omit<EvidenceReceipt, 'signature'> = {
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
  };

  return signEvidenceReceipt(unsignedReceipt, extra?.secretKey);
}
