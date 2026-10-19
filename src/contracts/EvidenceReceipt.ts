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
 * Recursively canonicalizes any JS value:
 * - Objects have keys sorted lexicographically at all nesting depths
 * - Arrays preserve element order with each element recursively canonicalized
 * - Primitives and null are returned as-is
 * - Undefined values in objects are omitted to preserve deterministic JSON
 */
export function canonicalizeValue(val: any): any {
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => canonicalizeValue(item));
  }
  const sortedKeys = Object.keys(val).sort();
  const result: Record<string, any> = {};
  for (const key of sortedKeys) {
    const v = val[key];
    if (v !== undefined) {
      result[key] = canonicalizeValue(v);
    }
  }
  return result;
}

/**
 * Deterministically canonicalizes evidence receipt payload for cryptographic signing.
 * Recursively sorts all keys alphabetically at every nesting level so that nested
 * structures (steps, proofData, etc.) cannot be tampered with or omitted.
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

  const normalized = canonicalizeValue(canonicalObj);
  return JSON.stringify(normalized);
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
 * Fails closed gracefully on any malformed payload or signature.
 */
export function verifyEvidenceReceipt(
  receipt: any,
  secretKey?: string
): { valid: boolean; error?: string } {
  try {
    if (!receipt || typeof receipt !== 'object') {
      return { valid: false, error: 'Evidence receipt is missing or not an object.' };
    }

    if (!receipt.signature || typeof receipt.signature !== 'string') {
      return { valid: false, error: 'Evidence receipt is missing required HMAC signature.' };
    }

    if (!/^[0-9a-f]{64}$/i.test(receipt.signature)) {
      return { valid: false, error: 'Evidence receipt HMAC signature format is invalid (expected 64-char hex).' };
    }

    if (!receipt.receiptId || !receipt.skillId || !receipt.skillVersion || !receipt.status) {
      return { valid: false, error: 'Evidence receipt is missing mandatory metadata fields.' };
    }

    const secret = secretKey || AuthManager.getInstance().getSecret();
    const expectedCanonical = canonicalizeReceiptPayload(receipt);
    const expectedSig = crypto.createHmac('sha256', secret).update(expectedCanonical).digest('hex');

    const providedSig = receipt.signature;
    const providedBuf = Buffer.from(providedSig, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');

    if (
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return {
        valid: false,
        error: 'Evidence receipt HMAC signature is invalid, forged, or payload was tampered.',
      };
    }

    return { valid: true };
  } catch (err: any) {
    return {
      valid: false,
      error: `Evidence receipt verification failed closed: ${err?.message || 'Malformed payload or signature.'}`,
    };
  }
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
