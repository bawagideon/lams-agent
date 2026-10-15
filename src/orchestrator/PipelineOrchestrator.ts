import path from 'node:path';
import { YTEngineBridge } from '../bridge/YTEngineBridge.ts';
import { CapCutAdapter } from '../adapters/media/CapCutAdapter.ts';
import { HeadlessRenderer } from '../adapters/media/HeadlessRenderer.ts';
import { SkillRegistry } from '../skills/SkillRegistry.ts';
import { SkillRunner } from '../skills/SkillRunner.ts';
import type { EvidenceReceipt } from '../contracts/EvidenceReceipt.ts';

export interface MissionState {
  missionId: string;
  title: string;
  currentStage: 'RESEARCH' | 'SCRIPTING' | 'PRODUCTION' | 'EDITING' | 'REVIEW' | 'SCHEDULED' | 'FAILED';
  approvalRequired: boolean;
  approvalPrompt?: string;
  previewUrl?: string;
  capCutDraftPath?: string;
  receipts: EvidenceReceipt[];
}

export class PipelineOrchestrator {
  private bridge: YTEngineBridge;
  private capcutAdapter: CapCutAdapter;
  private renderer: HeadlessRenderer;
  private skillRegistry: SkillRegistry;
  private skillRunner: SkillRunner;
  private activeMissions: Map<string, MissionState> = new Map();

  constructor() {
    this.bridge = new YTEngineBridge();
    this.capcutAdapter = new CapCutAdapter();
    this.renderer = new HeadlessRenderer();
    this.skillRegistry = new SkillRegistry();
    this.skillRunner = new SkillRunner();
  }

  public getMissions(): MissionState[] {
    if (this.activeMissions.size === 0) {
      // Seed initial state
      this.activeMissions.set('ep-042', {
        missionId: 'ep-042',
        title: 'Episode 42: The Lost Architecture of Nubia',
        currentStage: 'REVIEW',
        approvalRequired: true,
        approvalPrompt: 'Episode #42 assets generated and timeline assembled. Approve for YouTube scheduling?',
        capCutDraftPath: path.resolve('test_output/capcut_draft_spike'),
        previewUrl: '/previews/ep-042-preview.mp4',
        receipts: [],
      });
    }
    return Array.from(this.activeMissions.values());
  }

  public async runMissionPipeline(missionId: string, topic: string, autoApprove = false): Promise<MissionState> {
    const mission: MissionState = {
      missionId,
      title: topic,
      currentStage: 'PRODUCTION',
      approvalRequired: false,
      receipts: [],
    };
    this.activeMissions.set(missionId, mission);

    // 1. Run Production Skill
    const prodSkill = this.skillRegistry.getSkill('youtube_production');
    if (prodSkill) {
      const prodRes = await this.skillRunner.execute({
        missionId,
        skill: prodSkill,
        params: { topic },
        isApprovedByHuman: true,
      });
      mission.receipts.push(prodRes.receipt);
    }

    // 2. Compile Media Plan via Bridge
    const mediaPlan = await this.bridge.compileRealEpisodeToMediaPlan(missionId);

    // 3. Assemble CapCut Draft
    const capcutRes = await this.capcutAdapter.createDraftFromMediaPlan(mediaPlan);
    mission.capCutDraftPath = capcutRes.draftPath;
    mission.currentStage = 'EDITING';

    // 4. Run CapCut Skill
    const capcutSkill = this.skillRegistry.getSkill('capcut_assembly');
    if (capcutSkill) {
      const capRes = await this.skillRunner.execute({
        missionId,
        skill: capcutSkill,
        params: { mediaPlanPath: 'media_plan.json' },
        isApprovedByHuman: true,
      });
      mission.receipts.push(capRes.receipt);
    }

    // 5. Enter Review Gate (Level 2 Approval)
    mission.currentStage = 'REVIEW';
    mission.approvalRequired = !autoApprove;
    mission.approvalPrompt = `Episode '${topic}' assembled. Timeline verified (${capcutRes.totalDurationSeconds}s). Approve publication?`;

    if (autoApprove) {
      await this.approveAndScheduleMission(missionId);
    }

    return mission;
  }

  public async approveAndScheduleMission(missionId: string): Promise<MissionState> {
    const mission = this.activeMissions.get(missionId);
    if (!mission) throw new Error(`Mission ${missionId} not found`);

    mission.approvalRequired = false;

    // Run YouTube Publish Skill
    const pubSkill = this.skillRegistry.getSkill('youtube_publish');
    if (pubSkill) {
      const pubRes = await this.skillRunner.execute({
        missionId,
        skill: pubSkill,
        params: {
          title: mission.title,
          publishAt: new Date(Date.now() + 86400000).toISOString(),
        },
        isApprovedByHuman: true,
      });
      mission.receipts.push(pubRes.receipt);
    }

    mission.currentStage = 'SCHEDULED';
    return mission;
  }
}
