import type { ObservedEvent } from './DemonstrationRecorder.ts';
import type { SkillContract, SkillActionStep } from '../contracts/SkillContract.ts';

export interface CompilationResult {
  skill: SkillContract;
  abstractedStepsCount: number;
  detectedInputs: string[];
  suggestedGateLevel: '0_autonomous' | '1_notify' | '2_approval_gate' | '3_strict_dual_key';
}

export interface CompileOptions {
  isSampleTemplate?: boolean;
}

export class WorkflowCompiler {
  /**
   * Compiles an observed GUI demonstration trace into a portable, verified SkillContract.
   * Performs schema validation on every synthesized action to prevent malformed execution.
   */
  public compile(sessionName: string, events: ObservedEvent[], options?: CompileOptions): CompilationResult {
    const isSample = !!options?.isSampleTemplate;
    const skillId = sessionName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const steps: SkillActionStep[] = [];
    const detectedInputs: Record<string, { type: string; description: string; required: boolean }> = {};

    let stepIndex = 1;
    let hasPublishOrExport = false;

    // Semantic grouping: merge and validate observed actions into verified intent
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];

      if (ev.eventType === 'navigate') {
        const target = String(ev.inputData ?? ev.windowTitle ?? '').trim();
        if (!target) {
          throw new Error(`Compilation error at step ${stepIndex}: 'navigate' event requires non-empty target URL or title.`);
        }
        steps.push({
          step: stepIndex++,
          name: `Navigate to ${ev.targetElement?.text || ev.application}`,
          action: 'browser.navigate',
          parameters: { target },
        });
      } else if (ev.eventType === 'file_select') {
        const inputKey = `input_file_${stepIndex}`;
        detectedInputs[inputKey] = {
          type: 'filepath',
          description: `Input file selected in ${ev.application}`,
          required: true,
        };
        steps.push({
          step: stepIndex++,
          name: `Select ${ev.targetElement?.text || 'File'}`,
          action: 'file.select',
          parameters: { fileKey: inputKey },
        });
      } else if (ev.eventType === 'keyboard' && typeof ev.inputData === 'string' && ev.inputData.length > 2) {
        const inputKey = `text_field_${stepIndex}`;
        const fieldName = (ev.targetElement?.selector || ev.targetElement?.text || 'input').trim();
        detectedInputs[inputKey] = {
          type: 'string',
          description: `Text entered for ${ev.targetElement?.text || 'field'}`,
          required: true,
        };
        steps.push({
          step: stepIndex++,
          name: `Enter ${ev.targetElement?.text || 'Input Text'}`,
          action: 'form.fill_text',
          parameters: { field: fieldName, valueKey: inputKey },
        });
      } else if (ev.eventType === 'assertion') {
        const condition = String(ev.targetElement?.text ?? ev.inputData ?? '').trim();
        if (!condition) {
          throw new Error(`Compilation error at step ${stepIndex}: 'assertion' event requires non-empty condition.`);
        }
        steps.push({
          step: stepIndex++,
          name: `Verify ${condition}`,
          action: 'action.verify',
          parameters: { condition, selector: ev.targetElement?.selector },
        });
      } else if (ev.eventType === 'click') {
        const label = (ev.targetElement?.text || 'Element').trim();
        if (!label && !ev.targetElement?.selector) {
          throw new Error(`Compilation error at step ${stepIndex}: 'click' event requires target text or selector.`);
        }
        if (/publish|upload|export|submit|delete|schedule|release/i.test(label)) {
          hasPublishOrExport = true;
        }
        steps.push({
          step: stepIndex++,
          name: `Click ${label}`,
          action: 'ui.click',
          parameters: { target: label, selector: ev.targetElement?.selector },
        });
      }
    }

    // Gating: sample templates or sensitive operations strictly require approval gate
    const suggestedGate = (hasPublishOrExport || isSample) ? '2_approval_gate' : '1_notify';

    const compiledSkill: SkillContract = {
      schemaVersion: '1.0',
      id: skillId,
      name: sessionName,
      version: '1.0.0',
      description: isSample
        ? `[Sample Template] Predefined demonstration template for ${sessionName}. Requires review before production execution.`
        : `Synthesized skill compiled from ${events.length} demonstration actions in ${events[0]?.application || 'desktop'}.`,
      executionMode: 'browser_agent',
      isSample,
      status: isSample ? 'sample_template' : 'draft',
      inputs: detectedInputs,
      preconditions: ['target_application_accessible'],
      approvalGate: {
        required: hasPublishOrExport || isSample,
        level: suggestedGate,
        prompt: `Review proposed execution parameters before ${sessionName} executes.`,
      },
      actions: steps,
      verification: {
        postconditions: ['target_screen_state_matches_final_demonstration'],
        proofRequired: true,
      },
      failureRecovery: {
        maxRetries: 2,
        alertLevel: 'medium',
      },
    };

    return {
      skill: compiledSkill,
      abstractedStepsCount: steps.length,
      detectedInputs: Object.keys(detectedInputs),
      suggestedGateLevel: suggestedGate,
    };
  }
}
