import { z } from 'zod';

export const SkillActionStepSchema = z.object({
  step: z.number(),
  name: z.string(),
  action: z.string(),
  parameters: z.record(z.string(), z.any()).optional().default({}),
  verificationAssert: z.string().optional(),
});

export const SkillApprovalGateSchema = z.object({
  required: z.boolean().default(false),
  level: z.enum(['0_autonomous', '1_notify', '2_approval_gate', '3_strict_dual_key']).default('0_autonomous'),
  prompt: z.string().optional(),
  previewAssetKey: z.string().optional(),
});

export const SkillContractSchema = z.object({
  schemaVersion: z.literal('1.0'),
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  executionMode: z.enum(['deterministic_api', 'file_draft', 'browser_agent', 'desktop_demonstration']),
  inputs: z.record(z.string(), z.object({
    type: z.string(),
    description: z.string(),
    required: z.boolean().default(true),
  })),
  preconditions: z.array(z.string()).default([]),
  approvalGate: SkillApprovalGateSchema,
  actions: z.array(SkillActionStepSchema),
  verification: z.object({
    postconditions: z.array(z.string()),
    proofRequired: z.boolean().default(true),
  }),
  failureRecovery: z.object({
    maxRetries: z.number().default(2),
    alertLevel: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  }),
});

export type SkillContract = z.infer<typeof SkillContractSchema>;
export type SkillActionStep = z.infer<typeof SkillActionStepSchema>;
export type SkillApprovalGate = z.infer<typeof SkillApprovalGateSchema>;
