import fs from 'node:fs';
import path from 'node:path';
import type { SkillContract } from '../contracts/SkillContract.ts';
import { computeSkillPlanHash } from '../contracts/SkillContract.ts';
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
import { CredentialStore } from '../auth/CredentialStore.ts';
import { PlaywrightBrowserAdapter } from '../adapters/browser/PlaywrightBrowserAdapter.ts';

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
  private browserAdapter: PlaywrightBrowserAdapter;

  constructor() {
    this.capcutAdapter = new CapCutAdapter();
    this.bridge = new YTEngineBridge();
    this.exportWatcher = new ExportFolderWatcher();
    this.renderer = new HeadlessRenderer();
    this.browserAdapter = new PlaywrightBrowserAdapter();
  }

  public saveReceipt(receipt: EvidenceReceipt): void {
    try {
      const receiptsDir = path.resolve('data', 'evidence_receipts');
      if (!fs.existsSync(receiptsDir)) fs.mkdirSync(receiptsDir, { recursive: true });
      fs.writeFileSync(path.join(receiptsDir, `${receipt.receiptId}.json`), JSON.stringify(receipt, null, 2), 'utf-8');
    } catch (e: any) {
      console.warn('[SkillRunner] Could not save evidence receipt:', e.message);
    }
  }

  public async execute(input: SkillExecutionInput): Promise<SkillExecutionResult> {
    const { missionId, skill, params, isApprovedByHuman } = input;
    const startedAt = new Date().toISOString();
    const stepsEvidence: StepEvidence[] = [];

    // 1. Check if skill is an unpromoted sample template in production
    const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
    if (isProd && (skill.isSample || skill.status === 'sample_template')) {
      throw new Error(`Execution halted: Skill '${skill.name}' is an unverified sample template. Review and promote to verified production status before executing.`);
    }

    // 1b. Check machine-verifiable proof for browser skills in production
    if (isProd && skill.status === 'verified_production' && skill.executionMode === 'browser_agent') {
      const currentPlanHash = computeSkillPlanHash(skill);
      if (!skill.verificationProof || skill.verificationProof.planHash !== currentPlanHash) {
        throw new Error(`Execution halted: Skill '${skill.name}' verification proof is missing or invalidated by altered action plan. Re-verify with a successful test run before executing in production.`);
      }
    }

    // 2. Check Approval Gate
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

      this.saveReceipt(pendingReceipt);
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
        const stepParams = { ...(actionStep.parameters || {}), ...(params || {}) };
        const stepOutput = await this.dispatchAction(actionStep.action, stepParams, outputData);
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

        this.saveReceipt(failedReceipt);
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
        } else if (condition === 'video_verified_on_youtube') {
          const uploadOut = outputData['publisher.upload_video'];
          const videoId = uploadOut?.videoId;
          if (!videoId) {
            const failedReceipt = generateEvidenceReceipt(
              missionId,
              skill.id,
              skill.version,
              `Agent Executor (${skill.name})`,
              'FAILED',
              startedAt,
              stepsEvidence,
              { error: 'Postcondition failed: No videoId available to verify on YouTube.' }
            );
            return {
              receipt: failedReceipt,
              outputData: { status: 'FAILED', error: 'No videoId available to verify on YouTube.' },
            };
          }

          const refreshToken = CredentialStore.getInstance().getYouTubeRefreshToken() || config.GOOGLE_REFRESH_TOKEN;
          if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !refreshToken) {
            const failedReceipt = generateEvidenceReceipt(
              missionId,
              skill.id,
              skill.version,
              `Agent Executor (${skill.name})`,
              'FAILED',
              startedAt,
              stepsEvidence,
              { error: 'Postcondition failed: Missing active YouTube credentials. Cannot verify live release.' }
            );
            return {
              receipt: failedReceipt,
              outputData: { status: 'FAILED', error: 'Missing active YouTube credentials for live verification.' },
            };
          }

          try {
            const publisher = new YouTubePublisher(
              config.GOOGLE_CLIENT_ID,
              config.GOOGLE_CLIENT_SECRET,
              refreshToken
            );
            const verified = await publisher.verifyVideo(videoId, {
              channelId: params.targetChannelId || params.channelId,
              title: params.title,
              privacyStatus: 'private',
              publishAt: params.publishAt,
            });
            if (!verified.exists) {
              throw new Error(`Video ID ${videoId} not confirmed by YouTube.`);
            }
          } catch (err: any) {
            const failedReceipt = generateEvidenceReceipt(
              missionId,
              skill.id,
              skill.version,
              `Agent Executor (${skill.name})`,
              'FAILED',
              startedAt,
              stepsEvidence,
              { error: `Postcondition failed: Video live verification failed (${err.message})` }
            );
            return {
              receipt: failedReceipt,
              outputData: { status: 'FAILED', error: `YouTube live verification failed: ${err.message}` },
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
      outputData,
      {
        planHash: computeSkillPlanHash(skill),
        passedPostconditions: skill.verification?.postconditions || [],
      }
    );

    this.saveReceipt(successReceipt);
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

        const refreshToken = CredentialStore.getInstance().getYouTubeRefreshToken() || config.GOOGLE_REFRESH_TOKEN;
        if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !refreshToken) {
          throw new Error(
            `YouTube account is not linked. Please click 'Link YouTube Channel' in Connections before publishing.`
          );
        }

        const publisher = new YouTubePublisher(
          config.GOOGLE_CLIENT_ID,
          config.GOOGLE_CLIENT_SECRET,
          refreshToken
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

      case 'publisher.set_metadata': {
        const videoId = params.videoId || currentOutputs['publisher.upload_video']?.videoId;
        if (!videoId) {
          throw new Error('Cannot set YouTube metadata: No videoId found from upload step or params.');
        }
        const refreshToken = CredentialStore.getInstance().getYouTubeRefreshToken() || config.GOOGLE_REFRESH_TOKEN;
        if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !refreshToken) {
          throw new Error('Cannot set YouTube metadata: Missing YouTube OAuth credentials.');
        }

        const publisher = new YouTubePublisher(
          config.GOOGLE_CLIENT_ID,
          config.GOOGLE_CLIENT_SECRET,
          refreshToken
        );

        const res = await publisher.setMetadata(videoId, {
          title: params.title,
          description: params.description,
          tags: params.tags,
          categoryId: params.categoryId,
        });

        return {
          videoId,
          titleApplied: res.titleApplied,
          descriptionApplied: res.descriptionApplied,
          categoryId: res.categoryId,
          tags: res.tags,
        };
      }

      case 'publisher.set_thumbnail': {
        const videoId = params.videoId || currentOutputs['publisher.upload_video']?.videoId;
        const thumbnailPath = params.thumbnailFilePath || params.thumbnailPath;

        if (!thumbnailPath) {
          return { thumbnailSet: false, skipped: true, reason: 'no_thumbnail_provided' };
        }

        if (!videoId) {
          throw new Error('Cannot set YouTube thumbnail: No videoId found from upload step or params.');
        }
        const refreshToken = CredentialStore.getInstance().getYouTubeRefreshToken() || config.GOOGLE_REFRESH_TOKEN;
        if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !refreshToken) {
          throw new Error('Cannot set YouTube thumbnail: Missing YouTube OAuth credentials.');
        }

        const publisher = new YouTubePublisher(
          config.GOOGLE_CLIENT_ID,
          config.GOOGLE_CLIENT_SECRET,
          refreshToken
        );

        const res = await publisher.setThumbnail(videoId, thumbnailPath);
        return {
          videoId,
          thumbnailSet: true,
          thumbnailUrl: res.thumbnailUrl,
        };
      }

      case 'publisher.set_schedule': {
        const videoId = params.videoId || currentOutputs['publisher.upload_video']?.videoId;
        const publishAt = params.publishAt;

        if (!publishAt) {
          return { scheduled: false, privacyStatus: 'private', reason: 'no_schedule_specified' };
        }

        if (!videoId) {
          throw new Error('Cannot configure YouTube schedule: No videoId found from upload step or params.');
        }
        const refreshToken = CredentialStore.getInstance().getYouTubeRefreshToken() || config.GOOGLE_REFRESH_TOKEN;
        if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !refreshToken) {
          throw new Error('Cannot configure YouTube schedule: Missing YouTube OAuth credentials.');
        }

        const publisher = new YouTubePublisher(
          config.GOOGLE_CLIENT_ID,
          config.GOOGLE_CLIENT_SECRET,
          refreshToken
        );

        const res = await publisher.setSchedule(videoId, publishAt);
        return {
          videoId,
          publishAt: res.publishAt,
          privacyStatus: res.privacyStatus,
          scheduled: true,
        };
      }

      // Real Handlers for Compiled Demonstration Actions via Playwright
      case 'browser.navigate': {
        const target = params.target || params.url || 'about:blank';
        // Production loopback restriction: parameters can never override network policy
        const isProdEnv = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
        const allowLoopback = !isProdEnv && (process.env.ALLOW_TEST_LOOPBACK === 'true' || !!params.allowLoopback);
        const navResult = await this.browserAdapter.navigate(target, allowLoopback);
        return {
          navigated: true,
          target: navResult.url,
          title: navResult.title,
          status: navResult.status,
          timestamp: Date.now(),
        };
      }

      case 'ui.click': {
        const target = params.target || 'element';
        const clickResult = await this.browserAdapter.click(target, params.selector);
        return {
          clicked: true,
          target: clickResult.target,
          currentUrl: clickResult.currentUrl,
          timestamp: Date.now(),
        };
      }

      case 'form.fill_text': {
        const field = params.field || 'input';
        const value = params[params.valueKey] !== undefined ? params[params.valueKey] : params.value;
        if (value === undefined || value === null) {
          throw new Error(`form.fill_text failed: Missing value for field '${field}'.`);
        }
        const fillResult = await this.browserAdapter.fillText(field, String(value), params.selector);
        return {
          filled: true,
          field: fillResult.field,
          valueApplied: String(value),
          timestamp: Date.now(),
        };
      }

      case 'file.select': {
        const fileKey = params.fileKey || 'file';
        const filePath = params[fileKey] || params.filePath;
        if (!filePath) {
          throw new Error(`file.select failed: Missing required file path parameter.`);
        }
        const selectResult = await this.browserAdapter.selectFile(filePath, params.selector);
        return {
          fileSelected: true,
          filePath: selectResult.filePath,
          fileName: selectResult.fileName,
          timestamp: Date.now(),
        };
      }

      case 'action.verify': {
        const condition = params.condition || 'Verified';
        const timeoutMs = typeof params.timeoutMs === 'number' ? params.timeoutMs : 8000;
        const verifyResult = await this.browserAdapter.verify(condition, params.selector, params.expectedText, timeoutMs);
        return {
          verified: true,
          condition: verifyResult.condition,
          currentUrl: verifyResult.currentUrl,
          timestamp: Date.now(),
        };
      }

      default:
        throw new Error(`Unsupported skill action '${action}'. Execution halted to preserve integrity.`);
    }
  }
}
