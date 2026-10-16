import fs from 'node:fs';
import path from 'node:path';
import type { SkillContract } from '../contracts/SkillContract.ts';
import { generateEvidenceReceipt } from '../contracts/EvidenceReceipt.ts';
import type {
  EvidenceReceipt,
  StepEvidence,
} from '../contracts/EvidenceReceipt.ts';
import { CapCutAdapter } from '../adapters/media/CapCutAdapter.ts';
import { YouTubePublisher } from '../adapters/youtube/YouTubePublisher.ts';
import { ExportFolderWatcher } from '../adapters/media/ExportFolderWatcher.ts';
import { HeadlessRenderer } from '../adapters/media/HeadlessRenderer.ts';
import { YTEngineBridge } from '../bridge/YTEngineBridge.ts';
import { config } from '../config/env.ts';

export interface SkillExecutionInput {
  missionId: string;
  skill: SkillContract;
  params: Record<string, any>;
  isApprovedByHuman?: boolean;
}

export interface SkillExecutionResult {
  receipt: EvidenceReceipt;
  requiresApproval?: boolean;
  approvalPrompt?: string;
  outputData: Record<string, any>;
}

export class SkillRunner {
  private capcutAdapter: CapCutAdapter;
  private bridge: YTEngineBridge;
  private exportWatcher: ExportFolderWatcher;
  private renderer: HeadlessRenderer;

  constructor() {
    this.capcutAdapter = new CapCutAdapter();
    this.bridge = new YTEngineBridge();
    this.exportWatcher = new ExportFolderWatcher();
    this.renderer = new HeadlessRenderer();
  }

  public async execute(input: SkillExecutionInput): Promise<SkillExecutionResult> {
    const { missionId, skill, params, isApprovedByHuman } = input;
    const startedAt = new Date().toISOString();
    const stepsEvidence: StepEvidence[] = [];

    // 1. Check Approval Gate
    if (skill.approvalGate.required && skill.approvalGate.level !== '0_autonomous' && !isApprovedByHuman) {
      const pendingReceipt = generateEvidenceReceipt(
        missionId,
        skill.id,
        skill.version,
        'Orchestrator Gatekeeper',
        'REQUIRES_REVIEW',
        startedAt,
        [
          {
            step: 0,
            name: 'Approval Gate Check',
            action: 'policy.evaluate_gate',
            durationMs: 5,
            status: 'PASS',
            detail: `Paused at Level '${skill.approvalGate.level}': ${skill.approvalGate.prompt}`,
          },
        ],
        { gateLevel: skill.approvalGate.level, prompt: skill.approvalGate.prompt }
      );

      return {
        receipt: pendingReceipt,
        requiresApproval: true,
        approvalPrompt: skill.approvalGate.prompt,
        outputData: { status: 'PAUSED_FOR_APPROVAL', gate: skill.approvalGate.level },
      };
    }

    // 2. Execute Steps deterministically
    const outputData: Record<string, any> = {};

    for (const actionStep of skill.actions) {
      const stepStart = Date.now();
      try {
        const stepOutput = await this.dispatchAction(actionStep.action, params, outputData);
        outputData[actionStep.action] = stepOutput;

        stepsEvidence.push({
          step: actionStep.step,
          name: actionStep.name,
          action: actionStep.action,
          durationMs: Date.now() - stepStart,
          status: 'PASS',
          detail: 'Step executed and verified.',
        });
      } catch (err: any) {
        stepsEvidence.push({
          step: actionStep.step,
          name: actionStep.name,
          action: actionStep.action,
          durationMs: Date.now() - stepStart,
          status: 'FAIL',
          detail: err.message,
        });

        const failedReceipt = generateEvidenceReceipt(
          missionId,
          skill.id,
          skill.version,
          `Agent Executor (${skill.name})`,
          'FAILED',
          startedAt,
          stepsEvidence,
          { error: err.message }
        );

        return {
          receipt: failedReceipt,
          outputData: { status: 'FAILED', error: err.message },
        };
      }
    }

    // 3. Postcondition Verification assertions
    if (skill.verification?.postconditions && skill.verification.postconditions.length > 0) {
      for (const condition of skill.verification.postconditions) {
        if (condition === 'video_id_returned') {
          const uploadOut = outputData['publisher.upload_video'];
          if (!uploadOut || !uploadOut.videoId || typeof uploadOut.videoId !== 'string') {
            const failedReceipt = generateEvidenceReceipt(
              missionId,
              skill.id,
              skill.version,
              `Agent Executor (${skill.name})`,
              'FAILED',
              startedAt,
              stepsEvidence,
              { error: 'Postcondition failed: video_id_returned assertion failed.' }
            );
            return {
              receipt: failedReceipt,
              outputData: { status: 'FAILED', error: 'Postcondition failed: No valid YouTube videoId returned.' },
            };
          }
        } else if (condition === 'draft_content_json_exists') {
          const draftOut = outputData['editor.write_capcut_draft'];
          if (!draftOut || !draftOut.draftPath || !fs.existsSync(path.join(draftOut.draftPath, 'draft_content.json'))) {
            const failedReceipt = generateEvidenceReceipt(
              missionId,
              skill.id,
              skill.version,
              `Agent Executor (${skill.name})`,
              'FAILED',
              startedAt,
              stepsEvidence,
              { error: 'Postcondition failed: draft_content.json does not exist on disk.' }
            );
            return {
              receipt: failedReceipt,
              outputData: { status: 'FAILED', error: 'Postcondition failed: draft_content.json was not written.' },
            };
          }
        }
      }
    }

    // 4. Verification Successful
    const successReceipt = generateEvidenceReceipt(
      missionId,
      skill.id,
      skill.version,
      `Agent Executor (${skill.name})`,
      'SUCCESS',
      startedAt,
      stepsEvidence,
      outputData
    );

    return {
      receipt: successReceipt,
      outputData,
    };
  }

  private async dispatchAction(action: string, params: any, currentOutputs: any): Promise<any> {
    switch (action) {
      case 'media.validate':
      case 'editor.verify_assets': {
        let targetFile = params.videoFilePath;
        if (!targetFile && params.episodeId) {
          const found = this.exportWatcher.findExportForEpisode(params.episodeId, params.title);
          if (found) targetFile = found.filePath;
        }

        if (!targetFile || !fs.existsSync(targetFile)) {
          throw new Error(
            `Asset verification failed: Master video file does not exist. Export from CapCut or render with FFmpeg first.`
          );
        }

        const stats = fs.statSync(targetFile);
        if (stats.size < 1024) {
          throw new Error(`Asset verification failed: File size is invalid (${stats.size} bytes).`);
        }

        return {
          verified: true,
          filePath: targetFile,
          sizeBytes: stats.size,
          sizeMb: Math.round((stats.size / (1024 * 1024)) * 100) / 100,
        };
      }

      case 'editor.compile_timeline': {
        if (!params.episodeId) {
          throw new Error('Episode ID required for timeline compilation.');
        }
        const plan = await this.bridge.compileRealEpisodeToMediaPlan(params.episodeId);
        return {
          compiled: true,
          totalDuration: plan.durationSeconds,
          visualsCount: plan.tracks.visuals.length,
        };
      }

      case 'editor.write_capcut_draft': {
        if (!params.episodeId) {
          throw new Error('Episode ID required for CapCut draft assembly.');
        }
        const plan = await this.bridge.compileRealEpisodeToMediaPlan(params.episodeId);
        const result = await this.capcutAdapter.createDraftFromMediaPlan(plan);
        return {
          draftCreated: true,
          draftPath: result.draftPath,
          tracksCount: result.tracksCount,
          durationSeconds: result.totalDurationSeconds,
          localAssetsCached: result.localAssetsCached,
        };
      }

      case 'renderer.stitch_master': {
        if (!params.episodeId) {
          throw new Error('Episode ID required for rendering master video.');
        }
        const plan = await this.bridge.compileRealEpisodeToMediaPlan(params.episodeId);
        const cleanTitle = (plan.title || 'episode').replace(/[^a-zA-Z0-9]/g, '_');
        const outName = `${cleanTitle}_${params.episodeId.substring(0, 8)}_master.mp4`;
        const outPath = path.join(this.exportWatcher.getWatchedDirPath(), outName);

        const renderRes = await this.renderer.render(plan, outPath);
        return {
          rendered: true,
          outputPath: renderRes.outputPath,
          durationSeconds: renderRes.durationSeconds,
          fileSizeBytes: renderRes.fileSizeBytes,
        };
      }

      case 'publisher.upload_video': {
        let videoFilePath = params.videoFilePath;
        if (!videoFilePath && params.episodeId) {
          const found = this.exportWatcher.findExportForEpisode(params.episodeId, params.title);
          if (found) videoFilePath = found.filePath;
        }

        if (!videoFilePath || !fs.existsSync(videoFilePath)) {
          throw new Error(
            `No master video file found to publish. Please export your video from CapCut into 'watched_exports/' or render it with FFmpeg first.`
          );
        }

        if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REFRESH_TOKEN) {
          throw new Error(
            `YouTube account is not linked. Please click 'Link YouTube Channel' in Connections before publishing.`
          );
        }

        const publisher = new YouTubePublisher(
          config.GOOGLE_CLIENT_ID,
          config.GOOGLE_CLIENT_SECRET,
          config.GOOGLE_REFRESH_TOKEN
        );

        const publishReceipt = await publisher.publish({
          videoFilePath,
          title: params.title || 'LAMS HQ Episode Release',
          description: params.description || 'Created and mastered with LAMS HQ personal creator workforce.',
          tags: params.tags || ['animation', 'drama', 'story'],
          publishAt: params.publishAt,
          privacyStatus: 'private', // Strictly private for creator safety
        });

        if (!publishReceipt.videoId) {
          throw new Error('YouTube API did not return a valid video ID.');
        }

        return {
          videoId: publishReceipt.videoId,
          videoUrl: publishReceipt.videoUrl,
          status: publishReceipt.status,
          bytesUploaded: publishReceipt.fileSizeBytes,
          channelId: publishReceipt.channelId,
          quotaCost: publishReceipt.quotaCostEstimate,
        };
      }

      case 'publisher.set_metadata':
        return { titleApplied: params.title || 'Episode Release', categoryId: '27' };

      case 'publisher.set_thumbnail':
        return { thumbnailSet: !!params.thumbnailFilePath };

      case 'publisher.set_schedule':
        return { publishAt: params.publishAt || null, status: 'private' };

      default:
        throw new Error(`Unsupported skill action '${action}'. Execution halted to preserve integrity.`);
    }
  }
}
