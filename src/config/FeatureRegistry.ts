/**
 * LAMS HQ Feature & Control Registry
 * 
 * Central authoritative dictionary of all interactive controls, buttons, forms, and tools
 * across LAMS HQ. Used for accessible tooltips, onboarding walkthroughs, automated test validation,
 * and conversational assistant "What does this do?" support.
 * 
 * Written in plain creator language. Technical developer jargon (e.g. HMAC, Supabase, 2_approval_gate)
 * is translated into creator-centric concepts like "Security signature", "Cloud database", and "Approval checkpoint".
 */

export type FeatureCategory = 
  | 'navigation'
  | 'recording'
  | 'video_editing'
  | 'publishing'
  | 'connections'
  | 'assistant'
  | 'review'
  | 'security'
  | 'settings';

export interface FeatureControl {
  id: string;
  label: string;
  category: FeatureCategory;
  purpose: string;
  outcome: string;
  sideEffects: string;
  failureGuidance: string;
  keyboardShortcut?: string;
}

export const FEATURE_REGISTRY: Record<string, FeatureControl> = {
  // Navigation & Tabs
  'nav-home': {
    id: 'nav-home',
    label: 'Overview & Mission Control',
    category: 'navigation',
    purpose: 'Navigate to the primary overview displaying active episode releases, recent automated recordings, and quick status metrics.',
    outcome: 'Switches the main view to the dashboard home summary.',
    sideEffects: 'Updates the browser history state and highlights the Home icon in the navigation bar.',
    failureGuidance: 'If the home view does not load, refresh the browser page.',
    keyboardShortcut: 'Alt+H',
  },
  'nav-episodes': {
    id: 'nav-episodes',
    label: 'Episodes Library',
    category: 'navigation',
    purpose: 'Browse all story episodes, view production stages, check scene generation progress, and launch review screens.',
    outcome: 'Displays the complete grid of episodes with filters for drafts, reviews, and scheduled releases.',
    sideEffects: 'Queries local database cache and updates view filter.',
    failureGuidance: 'Check that local database services are running if episodes fail to display.',
    keyboardShortcut: 'Alt+E',
  },
  'nav-skills': {
    id: 'nav-skills',
    label: 'Skills & Demonstrations Studio',
    category: 'navigation',
    purpose: 'Access the Demonstration Recorder studio to record, inspect, test, and manage automated creator skills.',
    outcome: 'Opens the recording workbench where desktop tasks are demonstrated and compiled.',
    sideEffects: 'Initializes the screen recording palette and loads saved skill contracts from disk.',
    failureGuidance: 'Ensure screen recording permissions are granted in your browser if recording fails.',
    keyboardShortcut: 'Alt+S',
  },
  'nav-activity': {
    id: 'nav-activity',
    label: 'Activity & Audit Log',
    category: 'navigation',
    purpose: 'Inspect real-time logs of agent tasks, background renders, file exports, and verified execution receipts.',
    outcome: 'Shows the chronological stream of system events and background worker processes.',
    sideEffects: 'Polls recent system logs from disk storage.',
    failureGuidance: 'Logs are stored in local data files; check disk space if logs are not updating.',
  },
  'nav-connections': {
    id: 'nav-connections',
    label: 'Channel & Service Connections',
    category: 'navigation',
    purpose: 'Connect and manage external platforms such as YouTube channels, cloud media storage, and speech synthesis services.',
    outcome: 'Opens the connections panel showing active channel link status and secure credential settings.',
    sideEffects: 'Verifies active API tokens against connected service providers.',
    failureGuidance: 'If a service shows disconnected, click its reconnect button to refresh the authorization token.',
    keyboardShortcut: 'Alt+C',
  },
  'mobileNavToggle': {
    id: 'mobileNavToggle',
    label: 'Mobile Navigation Menu',
    category: 'navigation',
    purpose: 'Toggle the navigation sidebar on mobile phones and tablets.',
    outcome: 'Expands or collapses the mobile sidebar drawer.',
    sideEffects: 'Toggles sidebar overlay state.',
    failureGuidance: 'Tap outside the drawer or tap the toggle again to close.',
  },
  'sidebarBackdrop': {
    id: 'sidebarBackdrop',
    label: 'Close Mobile Menu',
    category: 'navigation',
    purpose: 'Dismiss the mobile navigation drawer when tapping outside.',
    outcome: 'Closes the mobile sidebar overlay.',
    sideEffects: 'Hides drawer and restores background interaction.',
    failureGuidance: 'Tap anywhere outside the sidebar to close.',
  },
  'btnTabEpisodes': {
    id: 'btnTabEpisodes',
    label: 'View All Episodes',
    category: 'navigation',
    purpose: 'Quickly switch to the complete episodes catalog from the dashboard overview.',
    outcome: 'Navigates to the episodes view and resets search filters.',
    sideEffects: 'Updates active navigation tab state.',
    failureGuidance: 'If the view does not change, use the sidebar navigation link.',
  },
  'btnTabSkills': {
    id: 'btnTabSkills',
    label: 'View All Skills',
    category: 'navigation',
    purpose: 'Quickly switch to the automation skills list from the dashboard overview.',
    outcome: 'Navigates to the skills studio view.',
    sideEffects: 'Updates active navigation tab state.',
    failureGuidance: 'If the view does not change, use the sidebar navigation link.',
  },

  // Episode Search & Filtering
  'episodeSearchInput': {
    id: 'episodeSearchInput',
    label: 'Search Episodes',
    category: 'review',
    purpose: 'Filter episodes by title, project name, or story themes.',
    outcome: 'Instantly filters the visible episode cards as you type.',
    sideEffects: 'Updates URL search query parameter in client state.',
    failureGuidance: 'Clear the search box if no matching episodes appear.',
  },
  'filter-btn-all': {
    id: 'filter-btn-all',
    label: 'Show All Episodes',
    category: 'review',
    purpose: 'Display all story episodes regardless of their current status.',
    outcome: 'Resets status filtering to show drafts, in-review, and scheduled episodes.',
    sideEffects: 'Updates active filter button style.',
    failureGuidance: 'Click again or use the search bar if list is empty.',
  },
  'filter-btn-draft': {
    id: 'filter-btn-draft',
    label: 'Show In-Progress Drafts',
    category: 'review',
    purpose: 'Filter the episode list to show only episodes currently being written or animated.',
    outcome: 'Displays only draft episodes in the grid.',
    sideEffects: 'Applies filter criteria to episode cards.',
    failureGuidance: 'If no drafts exist, create or import a new episode in your project.',
  },
  'filter-btn-review': {
    id: 'filter-btn-review',
    label: 'Show Needs Review',
    category: 'review',
    purpose: 'Filter the episode list to show episodes ready for your creative review and approval.',
    outcome: 'Displays only episodes awaiting final creator sign-off.',
    sideEffects: 'Applies filter criteria to episode cards.',
    failureGuidance: 'Review your episode scenes before approving for master render.',
  },
  'filter-btn-scheduled': {
    id: 'filter-btn-scheduled',
    label: 'Show Scheduled Releases',
    category: 'review',
    purpose: 'Filter the episode list to show episodes scheduled for future private or public video releases.',
    outcome: 'Displays scheduled episodes with their target release times.',
    sideEffects: 'Applies filter criteria to episode cards.',
    failureGuidance: 'Use the release scheduler on any completed episode to schedule a release.',
  },
  'btnResetFilters': {
    id: 'btnResetFilters',
    label: 'Reset Filters',
    category: 'review',
    purpose: 'Clear all active search terms and status filters to show the complete episode library.',
    outcome: 'Clears the search input and activates the "All" status filter.',
    sideEffects: 'Restores default visibility for all cards.',
    failureGuidance: 'Reload the page if the grid does not reset.',
  },

  // Demonstration Recorder & Studio
  'recorderSkillName': {
    id: 'recorderSkillName',
    label: 'Skill Name Input',
    category: 'recording',
    purpose: 'Name the automated task or demonstration being recorded (e.g. "CapCut Assembly", "Thumbnail Generator").',
    outcome: 'Sets the display title and unique identifier for the compiled skill.',
    sideEffects: 'Used as the primary key when saving the skill contract.',
    failureGuidance: 'Use a clear descriptive name without special punctuation.',
  },
  'recorderTargetApp': {
    id: 'recorderTargetApp',
    label: 'Target Application Input',
    category: 'recording',
    purpose: 'Specify which desktop application or browser workflow is being captured (e.g. "CapCut Desktop", "YouTube Studio").',
    outcome: 'Binds the demonstration steps to the designated workspace application.',
    sideEffects: 'Recorded in the demonstration manifest metadata.',
    failureGuidance: 'Enter the exact application name or select from available presets.',
  },
  'chkCaptureAudio': {
    id: 'chkCaptureAudio',
    label: 'Capture Audio Toggle',
    category: 'recording',
    purpose: 'Enable or disable microphone/audio capture during screen demonstration recording.',
    outcome: 'Instructs the media recorder to include or omit the audio track.',
    sideEffects: 'Requests audio permission from the browser if checked.',
    failureGuidance: 'Grant microphone permission in your browser settings if audio fails to record.',
  },
  'btnStartCapture': {
    id: 'btnStartCapture',
    label: 'Start Demonstration Recording',
    category: 'recording',
    purpose: 'Begin capturing screen video and GUI interactions to train a new automated skill.',
    outcome: 'Prompts for screen or window selection and starts the live interaction recorder.',
    sideEffects: 'Creates a new demonstration session on disk with a cryptographic session ID.',
    failureGuidance: 'Ensure you select the correct application window in the browser share dialog.',
    keyboardShortcut: 'Ctrl+Shift+R',
  },
  'btnStopCapture': {
    id: 'btnStopCapture',
    label: 'Stop Recording & Finalize',
    category: 'recording',
    purpose: 'Conclude the demonstration, save the video file, and seal the step checksum manifest.',
    outcome: 'Stops video capture, uploads recording chunks, and presents the review/redaction palette.',
    sideEffects: 'Saves video to disk, computes SHA-256 integrity checksum, and stores demonstration record.',
    failureGuidance: 'Wait a few seconds for video chunks to finish writing to disk before compiling.',
    keyboardShortcut: 'Ctrl+Shift+S',
  },
  'btnQuickSelectScreen': {
    id: 'btnQuickSelectScreen',
    label: 'Select Screen or Window',
    category: 'recording',
    purpose: 'Quickly trigger the browser window selection dialog without starting event capture.',
    outcome: 'Opens the system display share selector.',
    sideEffects: 'Attaches the video stream to the preview monitor.',
    failureGuidance: 'Allow screen sharing permission in your browser.',
  },
  'btnClearRecording': {
    id: 'btnClearRecording',
    label: 'Discard Demonstration Trace',
    category: 'recording',
    purpose: 'Clear the current demonstration events and reset the recorder to a clean state.',
    outcome: 'Removes recorded events from memory and resets the studio timer.',
    sideEffects: 'Discards uncompiled trace events.',
    failureGuidance: 'Save or compile your demonstration first if you want to keep it.',
  },
  'btnCompileSkill': {
    id: 'btnCompileSkill',
    label: 'Compile Demonstration to Skill',
    category: 'recording',
    purpose: 'Transform observed clicks, text inputs, and assertions into a verified, reproducible Skill Contract.',
    outcome: 'Validates all steps, checks inputs, assigns security checkpoints, and saves the skill to the registry.',
    sideEffects: 'Writes the compiled skill to custom skills storage and binds the manifest checksum.',
    failureGuidance: 'Check that at least one action step was recorded before compiling.',
  },
  'btnCompileFromStudio': {
    id: 'btnCompileFromStudio',
    label: 'Compile From Studio Palette',
    category: 'recording',
    purpose: 'Compile the manually structured or observed studio steps into a production skill.',
    outcome: 'Validates all action parameters and saves the executable contract.',
    sideEffects: 'Stores verified skill contract in local disk storage.',
    failureGuidance: 'Ensure all required fields have target selectors or labels.',
  },
  'btnDownloadVideo': {
    id: 'btnDownloadVideo',
    label: 'Download Demonstration Video',
    category: 'recording',
    purpose: 'Download the recorded screen demonstration MP4 file to your local computer.',
    outcome: 'Triggers a browser file download of the recorded demonstration video.',
    sideEffects: 'Reads recorded video bytes from server storage.',
    failureGuidance: 'Ensure recording has finished and video file size is greater than zero.',
  },
  'btnRetryUploadVideo': {
    id: 'btnRetryUploadVideo',
    label: 'Retry Video Upload',
    category: 'recording',
    purpose: 'Retry saving the local demonstration video to the server if the initial upload was interrupted.',
    outcome: 'Re-transmits the video blob to the server upload endpoint.',
    sideEffects: 'Writes video file to disk and recalculates SHA-256 integrity check.',
    failureGuidance: 'Keep the browser tab open while the upload finishes.',
  },

  // Action Step Palette (Manual & Observed Step Builders)
  'palBtnClick': {
    id: 'palBtnClick',
    label: 'Add Click Step',
    category: 'recording',
    purpose: 'Add a simulated button or menu click step to the active demonstration trace.',
    outcome: 'Appends a UI click event with element text and selector to the step stream.',
    sideEffects: 'Updates demonstration event list and step counter.',
    failureGuidance: 'Provide a clear element label so the browser agent can locate the button.',
  },
  'palBtnKeyboard': {
    id: 'palBtnKeyboard',
    label: 'Add Text Input Step',
    category: 'recording',
    purpose: 'Add a text typing step into an input box or form field.',
    outcome: 'Appends a text entry event with field name and input value.',
    sideEffects: 'Updates demonstration event list.',
    failureGuidance: 'Use redaction for sensitive API keys or passwords before compiling.',
  },
  'palBtnNavigate': {
    id: 'palBtnNavigate',
    label: 'Add Navigation Step',
    category: 'recording',
    purpose: 'Add a URL navigation or window focus step to the demonstration.',
    outcome: 'Appends a browser navigate event with target address.',
    sideEffects: 'Updates demonstration event list.',
    failureGuidance: 'Enter a valid URL or application window title.',
  },
  'palBtnFile': {
    id: 'palBtnFile',
    label: 'Add File Selection Step',
    category: 'recording',
    purpose: 'Add a file chooser step to import media, project files, or templates.',
    outcome: 'Appends a file select event with input file key parameter.',
    sideEffects: 'Updates demonstration event list.',
    failureGuidance: 'Ensure the source file exists in your workspace.',
  },
  'palBtnAssert': {
    id: 'palBtnAssert',
    label: 'Add Verification Assertion',
    category: 'recording',
    purpose: 'Add a visual or DOM state assertion to ensure the task finished successfully before moving on.',
    outcome: 'Appends an assertion step that must pass during future automated runs.',
    sideEffects: 'Enforces verification postconditions on compiled skill.',
    failureGuidance: 'Specify an element selector or text that indicates completion.',
  },
  'btn-remove-event': {
    id: 'btn-remove-event',
    label: 'Remove Recorded Step',
    category: 'recording',
    purpose: 'Delete an individual mistake or unwanted step from the recorded demonstration trace.',
    outcome: 'Removes the chosen step and recalculates the demonstration integrity checksum.',
    sideEffects: 'Updates step indexes and refreshes the event stream.',
    failureGuidance: 'Click the red cross next to the step you want to delete.',
  },

  // Quick Action Presets
  'btnPresetYtShorts': {
    id: 'btnPresetYtShorts',
    label: 'YouTube Shorts Skill Preset',
    category: 'recording',
    purpose: 'Load a standard template demonstration for creating and posting vertical YouTube Shorts.',
    outcome: 'Fills the recorder with pre-configured Shorts automation steps.',
    sideEffects: 'Populates step list with standard YouTube Shorts pipeline.',
    failureGuidance: 'Review loaded steps and customize them for your channel.',
  },
  'btnPresetCapcutCaptions': {
    id: 'btnPresetCapcutCaptions',
    label: 'CapCut Auto-Captions Preset',
    category: 'recording',
    purpose: 'Load a template demonstration for applying automated animated subtitles in CapCut.',
    outcome: 'Fills the recorder with CapCut text styling and speech-to-text steps.',
    sideEffects: 'Populates step list with CapCut subtitle pipeline.',
    failureGuidance: 'Ensure CapCut desktop is installed and accessible.',
  },
  'btnPresetTiktokUpload': {
    id: 'btnPresetTiktokUpload',
    label: 'TikTok Publishing Preset',
    category: 'recording',
    purpose: 'Load a template demonstration for uploading vertical video drafts to TikTok.',
    outcome: 'Fills the recorder with TikTok draft upload steps.',
    sideEffects: 'Populates step list with TikTok publish pipeline.',
    failureGuidance: 'Verify your TikTok creator account credentials.',
  },

  // Video Editing & CapCut Draft Assembly
  'btnHeroCapCut': {
    id: 'btnHeroCapCut',
    label: 'Assemble CapCut Timeline Draft',
    category: 'video_editing',
    purpose: 'Convert the current episode scenes, voiceovers, and animations into a native CapCut desktop project draft.',
    outcome: 'Generates draft_content.json and draft_meta_info.json on disk with all media tracks aligned.',
    sideEffects: 'Caches scene assets locally and creates a new project folder in your CapCut draft directory.',
    failureGuidance: 'If scene media is missing, verify scene generation status or check asset download cache.',
  },
  'btnCapCutTop': {
    id: 'btnCapCutTop',
    label: 'Open In CapCut',
    category: 'video_editing',
    purpose: 'Assemble the multi-track timeline project and prepare CapCut desktop for editing.',
    outcome: 'Writes project draft files and displays the local draft path on disk.',
    sideEffects: 'Creates native project files and copies local media into the project workspace.',
    failureGuidance: 'Open CapCut desktop and look for the newly assembled project draft.',
  },
  'btnCopyDraftPath': {
    id: 'btnCopyDraftPath',
    label: 'Copy CapCut Draft Folder Path',
    category: 'video_editing',
    purpose: 'Copy the absolute folder path of the assembled CapCut project to your clipboard for quick access.',
    outcome: 'Copies the file directory path to system clipboard and shows a confirmation toast.',
    sideEffects: 'Reads draft directory location from project metadata.',
    failureGuidance: 'Paste the path into your Windows File Explorer to open the project folder directly.',
  },
  'btnTriggerRenderFromCapcut': {
    id: 'btnTriggerRenderFromCapcut',
    label: 'Render Master Video',
    category: 'video_editing',
    purpose: 'Render the master high-definition MP4 video from the assembled scene assets.',
    outcome: 'Launches automated video stitching and displays live progress.',
    sideEffects: 'Assembles media clips and outputs a finalized MP4 file to the watched exports folder.',
    failureGuidance: 'If FFmpeg is not installed, render the project directly inside CapCut desktop and export to watched_exports.',
  },
  'btnRenderTop': {
    id: 'btnRenderTop',
    label: 'Render Video Master',
    category: 'video_editing',
    purpose: 'Stitch scenes, voiceover audio, and visual clips into a finalized video file.',
    outcome: 'Starts the video rendering process and updates the video preview player upon completion.',
    sideEffects: 'Writes completed master MP4 to the exports directory on disk.',
    failureGuidance: 'Check that all scenes have valid visual clips and voiceover audio before rendering.',
  },
  'btnFfmpegFallback': {
    id: 'btnFfmpegFallback',
    label: 'Fast Local Video Render (FFmpeg)',
    category: 'video_editing',
    purpose: 'Quickly stitch scene videos together using the local FFmpeg engine without opening CapCut.',
    outcome: 'Renders the master MP4 directly in the background and saves it to watched exports.',
    sideEffects: 'Generates a master video file and updates episode preview.',
    failureGuidance: 'Verify that FFmpeg is available on your computer system PATH.',
  },
  'btnCopyRenderPath': {
    id: 'btnCopyRenderPath',
    label: 'Copy Master Video File Path',
    category: 'video_editing',
    purpose: 'Copy the full file path of the rendered master video to the clipboard.',
    outcome: 'Copies the MP4 file path to system clipboard.',
    sideEffects: 'None.',
    failureGuidance: 'Paste the path into your media player or video editor.',
  },
  'btnPlayMaster': {
    id: 'btnPlayMaster',
    label: 'Play Master Video',
    category: 'video_editing',
    purpose: 'Play the rendered full-length master video in the preview player.',
    outcome: 'Loads the master MP4 into the video player and begins playback.',
    sideEffects: 'Updates active player source to the master export file.',
    failureGuidance: 'Render or export a master video first if the file is not found.',
  },

  // Publishing & Release Room
  'btnHeroRelease': {
    id: 'btnHeroRelease',
    label: 'Open Release Room',
    category: 'publishing',
    purpose: 'Open the preflight release checklist to schedule or publish the current episode.',
    outcome: 'Displays the Release Room modal with channel status, video verification, and scheduling options.',
    sideEffects: 'Checks YouTube channel connection status and verifies master export file.',
    failureGuidance: 'Render a master video and link your YouTube channel before publishing.',
  },
  'btnApproveTop': {
    id: 'btnApproveTop',
    label: 'Approve & Release Episode',
    category: 'publishing',
    purpose: 'Confirm creative review sign-off and open the safe release scheduler.',
    outcome: 'Opens the release modal with Safe Mode private upload pre-selected.',
    sideEffects: 'Validates preflight checklist requirements.',
    failureGuidance: 'Ensure all required scenes are reviewed and approved.',
  },
  'btnConfirmRelease': {
    id: 'btnConfirmRelease',
    label: 'Confirm Private Release',
    category: 'publishing',
    purpose: 'Authorize the private upload or scheduled release to your connected YouTube channel.',
    outcome: 'Uploads the master video to YouTube in Safe Mode (strictly private) and records a tamper-proof receipt.',
    sideEffects: 'Consumes an approval checkpoint, uploads video file, and saves evidence receipt to disk.',
    failureGuidance: 'If the upload fails, verify your YouTube account connection in the Connections tab.',
  },
  'releaseDate': {
    id: 'releaseDate',
    label: 'Release Date Picker',
    category: 'publishing',
    purpose: 'Choose the calendar date for scheduled release on YouTube.',
    outcome: 'Sets the scheduled release date parameter.',
    sideEffects: 'Used to configure YouTube video publishAt timestamp.',
    failureGuidance: 'Choose a date in the future if scheduling an automated release.',
  },
  'releaseTime': {
    id: 'releaseTime',
    label: 'Release Time Picker',
    category: 'publishing',
    purpose: 'Choose the time of day for scheduled release on YouTube.',
    outcome: 'Sets the scheduled release time parameter.',
    sideEffects: 'Combined with release date to form an ISO timestamp.',
    failureGuidance: 'Leave blank to publish immediately as a private review video.',
  },
  'btnCloseReleaseX': {
    id: 'btnCloseReleaseX',
    label: 'Close Release Modal (X)',
    category: 'publishing',
    purpose: 'Dismiss the release dialog without making changes.',
    outcome: 'Closes the Release Room modal.',
    sideEffects: 'None.',
    failureGuidance: 'Click anywhere outside the dialog to dismiss.',
  },
  'btnCloseReleaseBtn': {
    id: 'btnCloseReleaseBtn',
    label: 'Cancel Release',
    category: 'publishing',
    purpose: 'Cancel the release action and return to the previous view.',
    outcome: 'Closes the Release Room modal.',
    sideEffects: 'None.',
    failureGuidance: 'No video is uploaded when canceling.',
  },
  'btnClosePreviewReleaseX': {
    id: 'btnClosePreviewReleaseX',
    label: 'Close Preview Release Dialog',
    category: 'publishing',
    purpose: 'Dismiss the release modal on the episode preview screen.',
    outcome: 'Hides the release dialog.',
    sideEffects: 'None.',
    failureGuidance: 'Click the backdrop or press Escape to close.',
  },
  'btnClosePreviewReleaseBtn': {
    id: 'btnClosePreviewReleaseBtn',
    label: 'Cancel Preview Release',
    category: 'publishing',
    purpose: 'Cancel the release action on the episode preview screen.',
    outcome: 'Hides the release dialog.',
    sideEffects: 'None.',
    failureGuidance: 'No video is uploaded when canceling.',
  },
  'btnOpenReleaseAfterRender': {
    id: 'btnOpenReleaseAfterRender',
    label: 'Proceed to Release Room',
    category: 'publishing',
    purpose: 'Continue directly to the release checklist after video rendering completes.',
    outcome: 'Opens the Release Room modal with the freshly rendered video attached.',
    sideEffects: 'Selects the new master video file for release.',
    failureGuidance: 'Ensure the video finished rendering without errors.',
  },

  // Connections & YouTube Channel Linking
  'btnCopyRedirectUri': {
    id: 'btnCopyRedirectUri',
    label: 'Copy OAuth Redirect URL',
    category: 'connections',
    purpose: 'Copy the authorized redirect URL to paste into your Google Cloud OAuth application settings.',
    outcome: 'Copies http://localhost:4200/oauth2callback to the clipboard.',
    sideEffects: 'None.',
    failureGuidance: 'Paste this exact URL into "Authorized redirect URIs" in your Google Cloud Console.',
  },
  'btnToggleManualToken': {
    id: 'btnToggleManualToken',
    label: 'Manual Token Entry Toggle',
    category: 'connections',
    purpose: 'Open manual entry mode to directly supply a YouTube refresh token if browser OAuth redirect is blocked.',
    outcome: 'Expands or hides the manual token input form.',
    sideEffects: 'Toggles form visibility.',
    failureGuidance: 'Use standard "Link YouTube Channel" one-click authorization if possible.',
  },
  'inputYtRefreshToken': {
    id: 'inputYtRefreshToken',
    label: 'YouTube Refresh Token Input',
    category: 'connections',
    purpose: 'Enter a valid Google OAuth refresh token for channel access.',
    outcome: 'Accepts the refresh token string for validation.',
    sideEffects: 'Validated against YouTube Data API and stored securely in credential storage.',
    failureGuidance: 'Ensure the token starts with 1// and has not expired.',
  },
  'btnSaveYtToken': {
    id: 'btnSaveYtToken',
    label: 'Verify & Save YouTube Token',
    category: 'connections',
    purpose: 'Test the entered refresh token against YouTube Data API and save it securely.',
    outcome: 'Validates channel ownership, displays channel title, and saves credentials.',
    sideEffects: 'Persists credentials to local credential store without modifying source files.',
    failureGuidance: 'If validation fails with "invalid_grant", generate a fresh token with prompt=consent.',
  },

  // Conversational Assistant & Chat
  'chatInput': {
    id: 'chatInput',
    label: 'Assistant Message Input',
    category: 'assistant',
    purpose: 'Ask questions, request skill executions, review episodes, or ask "What does this button do?".',
    outcome: 'Receives creator prompt text for the AI assistant.',
    sideEffects: 'None until submitted.',
    failureGuidance: 'Type your instruction or choose one of the quick suggestion chips below.',
  },
  'btnSendChat': {
    id: 'btnSendChat',
    label: 'Send Assistant Message',
    category: 'assistant',
    purpose: 'Submit your message or skill instruction to the creator assistant.',
    outcome: 'Processes the request, triggers requested actions, and displays response with action cards.',
    sideEffects: 'Records conversation message and may trigger skill execution.',
    failureGuidance: 'Make sure your message is not empty before sending.',
    keyboardShortcut: 'Enter',
  },
  'btnClearChat': {
    id: 'btnClearChat',
    label: 'Clear Chat History',
    category: 'assistant',
    purpose: 'Clear the current conversation history in the assistant pane.',
    outcome: 'Clears displayed chat bubbles and restores default welcome prompt.',
    sideEffects: 'Resets in-memory conversation state.',
    failureGuidance: 'Chat history can be cleared at any time without affecting saved episodes or skills.',
  },
  'btnCloseChat': {
    id: 'btnCloseChat',
    label: 'Close Assistant Drawer',
    category: 'assistant',
    purpose: 'Hide the assistant drawer on mobile screens.',
    outcome: 'Slides the chat drawer out of view.',
    sideEffects: 'Removes modal backdrop and restores full screen space.',
    failureGuidance: 'Tap the floating chat button in the bottom corner to reopen at any time.',
  },
  'btnFloatingChatToggle': {
    id: 'btnFloatingChatToggle',
    label: 'Toggle Assistant Floating Button',
    category: 'assistant',
    purpose: 'Open or close the AI assistant drawer from any screen.',
    outcome: 'Toggles the assistant panel into view.',
    sideEffects: 'Focuses message input box.',
    failureGuidance: 'Tap to open the assistant anytime you need guidance or action execution.',
  },
  'btnOpenMobileChat': {
    id: 'btnOpenMobileChat',
    label: 'Open Mobile Assistant',
    category: 'assistant',
    purpose: 'Open the assistant chat on mobile devices.',
    outcome: 'Opens the full-height chat overlay.',
    sideEffects: 'Applies backdrop blur and locks background scroll.',
    failureGuidance: 'Use the close button at top-right to dismiss.',
  },
  'btnQuickPromptTime': {
    id: 'btnQuickPromptTime',
    label: 'Quick Prompt: Reschedule Release',
    category: 'assistant',
    purpose: 'Ask the assistant to change the release schedule for an episode.',
    outcome: 'Inserts "Change release time to Friday 6pm" into chat and submits.',
    sideEffects: 'Sends chat prompt.',
    failureGuidance: 'Click the prompt chip or type your own custom schedule instruction.',
  },
  'btnQuickPromptToday': {
    id: 'btnQuickPromptToday',
    label: 'Quick Prompt: Show Today\'s Work',
    category: 'assistant',
    purpose: 'Ask the assistant to summarize current episode progress and pending reviews.',
    outcome: 'Inserts "Show today\'s work" into chat and displays pending items.',
    sideEffects: 'Queries episode status from database.',
    failureGuidance: 'Click to quickly see which episodes require your attention.',
  },
  'btnQuickPromptShort': {
    id: 'btnQuickPromptShort',
    label: 'Quick Prompt: Make a Short',
    category: 'assistant',
    purpose: 'Instruct the assistant to generate a vertical Short from the active episode.',
    outcome: 'Initiates Short generation workflow for the selected episode.',
    sideEffects: 'Prepares vertical video plan.',
    failureGuidance: 'Select an episode first before requesting a Short.',
  },

  // Security & Approval Gates
  'btnConfirmSkillApproval': {
    id: 'btnConfirmSkillApproval',
    label: 'Approve Skill Execution',
    category: 'security',
    purpose: 'Grant human creator authorization for a skill that reaches a security approval checkpoint.',
    outcome: 'Issues a single-use cryptographic approval token and executes the protected skill action.',
    sideEffects: 'Consumes approval token, executes steps, and generates signed evidence receipt.',
    failureGuidance: 'Review the proposed plan and parameters before approving sensitive actions.',
  },
  'btnCancelSkillApproval': {
    id: 'btnCancelSkillApproval',
    label: 'Decline Skill Execution',
    category: 'security',
    purpose: 'Decline and abort execution of a skill waiting at an approval checkpoint.',
    outcome: 'Cancels the execution request and records an aborted receipt.',
    sideEffects: 'Discards pending approval token.',
    failureGuidance: 'No action is taken when execution is declined.',
  },
  'btnCloseSkillApproval': {
    id: 'btnCloseSkillApproval',
    label: 'Dismiss Approval Dialog',
    category: 'security',
    purpose: 'Close the approval dialog without approving the pending action.',
    outcome: 'Dismisses the modal and keeps execution on hold.',
    sideEffects: 'None.',
    failureGuidance: 'You can re-open approval from the assistant or activity log.',
  },

  // Studio Key & Dialog Controls
  'btnSubmitKeyModal': {
    id: 'btnSubmitKeyModal',
    label: 'Save API Key',
    category: 'settings',
    purpose: 'Save a required service key (such as Gemini AI or ElevenLabs) to unlock features.',
    outcome: 'Validates key format and saves securely to the local credentials store.',
    sideEffects: 'Updates credential configuration without restarting server.',
    failureGuidance: 'Ensure you enter the full API key without extra spaces.',
  },
  'btnCancelKeyModal': {
    id: 'btnCancelKeyModal',
    label: 'Cancel Key Entry',
    category: 'settings',
    purpose: 'Dismiss the API key dialog without saving changes.',
    outcome: 'Closes the key entry modal.',
    sideEffects: 'None.',
    failureGuidance: 'Features requiring this key will remain locked until provided.',
  },
  'btnCloseKeyModal': {
    id: 'btnCloseKeyModal',
    label: 'Close Key Modal (X)',
    category: 'settings',
    purpose: 'Close the API key modal.',
    outcome: 'Dismisses the dialog.',
    sideEffects: 'None.',
    failureGuidance: 'Click anywhere outside to dismiss.',
  },
  'btnDevKeyFill': {
    id: 'btnDevKeyFill',
    label: 'Quick Key Setup Helper',
    category: 'settings',
    purpose: 'Fill test credential placeholder in development mode.',
    outcome: 'Populates the key field with development testing credentials.',
    sideEffects: 'Fills input field for review.',
    failureGuidance: 'Only available in local testing environments.',
  },
  'btnDismissResultModal': {
    id: 'btnDismissResultModal',
    label: 'Acknowledge Result Notification',
    category: 'review',
    purpose: 'Dismiss the operation result dialog.',
    outcome: 'Closes the completion modal.',
    sideEffects: 'None.',
    failureGuidance: 'Click anywhere outside or tap Escape to close.',
  },
  'btnCloseResultModal': {
    id: 'btnCloseResultModal',
    label: 'Close Result Dialog (X)',
    category: 'review',
    purpose: 'Dismiss the operation result dialog.',
    outcome: 'Closes the modal.',
    sideEffects: 'None.',
    failureGuidance: 'Click outside to close.',
  },
  'btnScrollToStudio': {
    id: 'btnScrollToStudio',
    label: 'Scroll to Demonstration Studio',
    category: 'recording',
    purpose: 'Smoothly scroll down to the Demonstration Studio workbench on the skills page.',
    outcome: 'Scrolls the page directly to the recorder canvas.',
    sideEffects: 'Adjusts page scroll position.',
    failureGuidance: 'Use mouse scroll if smooth scrolling is disabled in browser.',
  },
  'btnOpenTeach': {
    id: 'btnOpenTeach',
    label: 'Start Teach Mode Session',
    category: 'recording',
    purpose: 'Launch the interactive Teach Mode recording session.',
    outcome: 'Opens the recording configuration modal and prompts for screen capture.',
    sideEffects: 'Prepares demonstration recorder session.',
    failureGuidance: 'Give the new skill a name and target application before recording.',
  },
  'btnCloseTeachX': {
    id: 'btnCloseTeachX',
    label: 'Close Teach Modal (X)',
    category: 'recording',
    purpose: 'Dismiss the Teach Mode recording dialog.',
    outcome: 'Closes the teach modal.',
    sideEffects: 'None.',
    failureGuidance: 'Click outside to dismiss.',
  },
  'btnCloseTeachBtn': {
    id: 'btnCloseTeachBtn',
    label: 'Cancel Teach Session',
    category: 'recording',
    purpose: 'Cancel the setup of a new demonstration recording session.',
    outcome: 'Closes the teach setup modal.',
    sideEffects: 'None.',
    failureGuidance: 'No recording is started when canceling.',
  },
  'btnOpenTeachPrompt': {
    id: 'btnOpenTeachPrompt',
    label: 'Teach Me a New Skill Prompt',
    category: 'recording',
    purpose: 'Quickly launch the Demonstration Recorder from the assistant suggestion chips.',
    outcome: 'Opens the Demonstration Studio ready for screen capture.',
    sideEffects: 'Focuses demonstration recorder workbench.',
    failureGuidance: 'Follow the on-screen instructions to record your desktop actions.',
  },
};

/**
 * Retrieves a feature control by its exact element ID or alias.
 */
export function getFeature(id: string): FeatureControl | undefined {
  return FEATURE_REGISTRY[id];
}

/**
 * Returns all registered controls as an array.
 */
export function listFeatures(): FeatureControl[] {
  return Object.values(FEATURE_REGISTRY);
}

/**
 * Searches for a feature explanation matching a creator's natural language query.
 * Used by the AI chat assistant to answer "What does this button do?" questions.
 */
export function explainControl(query: string): string | null {
  const rawClean = query.trim();
  const stripped = query.toLowerCase().replace(/[?!.,;:"'()[\]{}]/g, ' ').trim();
  const clean = stripped.replace(/\s+/g, ' ');
  
  // 1. Direct ID match
  if (FEATURE_REGISTRY[rawClean]) {
    return formatExplanation(FEATURE_REGISTRY[rawClean]);
  }
  if (FEATURE_REGISTRY[clean]) {
    return formatExplanation(FEATURE_REGISTRY[clean]);
  }

  // 1b. Check if any word token is an exact feature ID
  const tokens = clean.split(/\s+/).filter(t => t.length > 2);
  for (const t of tokens) {
    if (FEATURE_REGISTRY[t]) {
      return formatExplanation(FEATURE_REGISTRY[t]);
    }
  }

  // 2. Exact label match
  for (const f of Object.values(FEATURE_REGISTRY)) {
    if (f.label.toLowerCase() === clean) {
      return formatExplanation(f);
    }
  }

  // 3. Keyword / semantic search across label, purpose, outcome
  const matches: Array<{ feature: FeatureControl; score: number }> = [];
  for (const f of Object.values(FEATURE_REGISTRY)) {
    let score = 0;
    const labelLower = f.label.toLowerCase();
    const purposeLower = f.purpose.toLowerCase();
    const idLower = f.id.toLowerCase();

    if (labelLower.includes(clean)) score += 10;
    if (idLower.includes(clean)) score += 8;
    if (purposeLower.includes(clean)) score += 5;

    // Check individual query tokens
    for (const t of tokens) {
      if (t === 'what' || t === 'does' || t === 'button' || t === 'this' || t === 'explain' || t === 'help') continue;
      if (idLower.includes(t)) score += 6;
      if (labelLower.includes(t)) score += 4;
      if (purposeLower.includes(t)) score += 2;
    }

    if (score > 3) {
      matches.push({ feature: f, score });
    }
  }

  if (matches.length > 0) {
    matches.sort((a, b) => b.score - a.score);
    return formatExplanation(matches[0].feature);
  }

  return null;
}

function formatExplanation(f: FeatureControl): string {
  let text = `<strong>${f.label}</strong> (<em>${f.category}</em>):<br/>` +
    `• <strong>Purpose:</strong> ${f.purpose}<br/>` +
    `• <strong>Immediate Outcome:</strong> ${f.outcome}<br/>` +
    `• <strong>Side Effects:</strong> ${f.sideEffects}<br/>` +
    `• <strong>If Something Goes Wrong:</strong> ${f.failureGuidance}`;
  
  if (f.keyboardShortcut) {
    text += `<br/>• <strong>Shortcut:</strong> <kbd class="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">${f.keyboardShortcut}</kbd>`;
  }
  return text;
}
