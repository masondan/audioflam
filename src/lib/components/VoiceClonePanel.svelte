<script lang="ts">
  import { customVoices, MAX_CUSTOM_VOICES, CLONE_PREVIEW_SCRIPT, selectedVoice, ALL_VOICES, type CustomVoice } from '$lib/stores';
  import { requestMicrophonePermission, createMediaRecorder, stopStream } from '$lib/utils/recording';
  import { prepareAudioForCloning } from '$lib/utils/audioPrep';

  // ── Panel state ──────────────────────────────────────────────────────────────
  let clonePanelOpen = $state(false);

  // ── Form fields ──────────────────────────────────────────────────────────────
  let voiceName = $state('');
  let country = $state('');

  // ── Recording state ──────────────────────────────────────────────────────────
  type RecordingState = 'idle' | 'countdown' | 'recording' | 'done';
  let recordingState = $state<RecordingState>('idle');
  let recordingSeconds = $state(0);
  let countdownValue = $state(3);
  let audioBlob = $state<Blob | null>(null);
  let audioBase64 = $state('');
  let audioFormat = $state('webm');

  // ── Playback state ────────────────────────────────────────────────────────────
  let isPlayingRecording = $state(false);
  let playbackAudio: HTMLAudioElement | null = null;

  // ── Processing state ──────────────────────────────────────────────────────────
  let isProcessing = $state(false);
  let processingMessage = $state('');
  let cloneComplete = $state(false);

  // ── Error / warning messages ──────────────────────────────────────────────────
  let errorMessage = $state('');
  let warningMessage = $state('');

  // ── Modal state ───────────────────────────────────────────────────────────────
  let showReadFirst = $state(false);
  let showExportModal = $state(false);
  let showDeleteModal = $state(false);
  let showLimitModal = $state(false);
  let modalTargetVoice = $state<CustomVoice | null>(null);

  // ── Preview playback (completed voice rows) ───────────────────────────────────
  let playingPreviewId = $state<string | null>(null);
  let previewAudio: HTMLAudioElement | null = null;

  // ── Internal refs ─────────────────────────────────────────────────────────────
  let mediaRecorder: MediaRecorder | null = null;
  let mediaStream: MediaStream | null = null;
  let recordingChunks: BlobPart[] = [];
  let recordingInterval: ReturnType<typeof setInterval> | null = null;
  let countdownTimeout: ReturnType<typeof setTimeout> | null = null;
  let errorTimeout: ReturnType<typeof setTimeout> | null = null;
  let fileInput: HTMLInputElement;
  let jsonInput: HTMLInputElement;

  // ── Derived ───────────────────────────────────────────────────────────────────
  let atLimit = $derived($customVoices.length >= MAX_CUSTOM_VOICES);
  let canCreate = $derived(
    audioBlob !== null &&
    voiceName.trim().length > 0 &&
    country.trim().length > 0 &&
    recordingState === 'done' &&
    !isProcessing &&
    !cloneComplete
  );

  // Progress bar fill percentage (capped at 100)
  let progressPercent = $derived(Math.min((recordingSeconds / 20) * 100, 100));
  // Colour: green if ≥10s, red if <10s
  let progressColor = $derived(recordingSeconds >= 10 ? '#CCFFCC' : '#FFCCCC');

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function showError(msg: string, duration = 3000) {
    errorMessage = msg;
    if (errorTimeout) clearTimeout(errorTimeout);
    errorTimeout = setTimeout(() => { errorMessage = ''; }, duration);
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Strip data URI prefix → raw base64
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function resetRecording() {
    if (recordingInterval) { clearInterval(recordingInterval); recordingInterval = null; }
    if (countdownTimeout) { clearTimeout(countdownTimeout); countdownTimeout = null; }
    stopStream(mediaStream);
    mediaStream = null;
    mediaRecorder = null;
    recordingChunks = [];
    recordingState = 'idle';
    recordingSeconds = 0;
    countdownValue = 3;
    audioBlob = null;
    audioBase64 = '';
    stopPlayback();
  }

  function stopPlayback() {
    if (playbackAudio) {
      playbackAudio.pause();
      playbackAudio = null;
    }
    isPlayingRecording = false;
  }

  // ── Record ────────────────────────────────────────────────────────────────────
  async function handleRecord() {
    if (atLimit) { showLimitModal = true; return; }

    try {
      mediaStream = await requestMicrophonePermission();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Microphone access failed.');
      return;
    }

    // Countdown 3 → 2 → 1
    recordingState = 'countdown';
    countdownValue = 3;

    const tick = () => {
      countdownValue--;
      if (countdownValue > 0) {
        countdownTimeout = setTimeout(tick, 1000);
      } else {
        startRecording();
      }
    };
    countdownTimeout = setTimeout(tick, 1000);
  }

  function startRecording() {
    if (!mediaStream) return;
    recordingChunks = [];
    const recorder = createMediaRecorder(mediaStream);
    mediaRecorder = recorder;
    // audioFormat will be set to 'audio/wav' after prepareAudioForCloning() runs

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordingChunks.push(e.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(recordingChunks, { type: recorder.mimeType });
      if (recordingSeconds < 10) {
        resetRecording();
        showError('Recording is too short. Please record for at least 10 seconds.');
        return;
      }

      try {
        processingMessage = 'Analyzing recording...';
        isProcessing = true;
        const processed = await prepareAudioForCloning(blob);
        audioBlob = processed.blob;
        audioBase64 = await blobToBase64(processed.blob);
        audioFormat = 'audio/wav'; // Always WAV after processing
        if (processed.warnings.length > 0) {
          warningMessage = processed.warnings.join(' ');
        }
      } catch (err) {
        resetRecording();
        showError(err instanceof Error ? err.message : 'Audio processing failed.');
        return;
      } finally {
        isProcessing = false;
        processingMessage = '';
      }
      
      recordingState = 'done';
      stopStream(mediaStream);
      mediaStream = null;
    };

    recorder.start(100);
    recordingState = 'recording';
    recordingSeconds = 0;

    recordingInterval = setInterval(() => {
      recordingSeconds++;
      if (recordingSeconds >= 20) {
        stopRecording();
      }
    }, 1000);
  }

  function stopRecording() {
    if (recordingInterval) { clearInterval(recordingInterval); recordingInterval = null; }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }

  function handleStopButton() {
    stopRecording();
    // onstop handler will validate duration and set state
  }

  // ── Playback of recorded audio ────────────────────────────────────────────────
  function handlePlayRecording() {
    if (!audioBlob) return;
    if (isPlayingRecording) {
      stopPlayback();
      return;
    }
    const url = URL.createObjectURL(audioBlob);
    playbackAudio = new Audio(url);
    playbackAudio.onended = () => { isPlayingRecording = false; playbackAudio = null; };
    playbackAudio.onerror = () => { isPlayingRecording = false; playbackAudio = null; };
    playbackAudio.play();
    isPlayingRecording = true;
  }

  // ── Delete recorded audio ─────────────────────────────────────────────────────
  function handleDeleteAudio() {
    resetRecording();
    warningMessage = '';
  }

  // ── Upload ────────────────────────────────────────────────────────────────────
  function handleUploadClick() {
    if (atLimit) { showLimitModal = true; return; }
    fileInput.click();
  }

  async function handleFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    warningMessage = '';
    errorMessage = '';

    try {
      processingMessage = 'Analyzing uploaded audio...';
      isProcessing = true;
      const processed = await prepareAudioForCloning(file);
      audioBlob = processed.blob;
      audioBase64 = await blobToBase64(processed.blob);
      audioFormat = 'audio/wav'; // Always WAV after processing
      if (processed.warnings.length > 0) {
        warningMessage = processed.warnings.join(' ');
      }
      // Estimate duration from WAV size: (bytes / 2 bytes/sample) / 24000 samples/sec
      recordingSeconds = Math.round(processed.blob.size / (24000 * 2));
      recordingState = 'done';
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Audio processing failed.');
      return;
    } finally {
      isProcessing = false;
      processingMessage = '';
    }
  }

  // ── Import ID ─────────────────────────────────────────────────────────────────
  function handleImportClick() {
    if (atLimit) { showLimitModal = true; return; }
    jsonInput.click();
  }

  async function handleJsonSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    let parsed: { voiceName?: string; country?: string; cloneId?: string };
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      showError('Invalid clone file. Please use an exported clone file.');
      return;
    }

    if (!parsed.voiceName || !parsed.country || !parsed.cloneId) {
      showError('Invalid clone file. Please use an exported clone file.');
      return;
    }

    isProcessing = true;
    processingMessage = 'Generating preview...';

    try {
      const previewBase64 = await generatePreview(parsed.cloneId);

      const newVoice: CustomVoice = {
        id: parsed.cloneId,
        name: parsed.voiceName,
        country: parsed.country,
        previewAudio: previewBase64,
        createdAt: Date.now()
      };

      customVoices.update(voices => [newVoice, ...voices]);
      resetRecording();
      voiceName = '';
      country = '';
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to import voice clone.');
    } finally {
      isProcessing = false;
      processingMessage = '';
    }
  }

  // ── Generate preview audio (WAV → MP3 via silence-removal) ───────────────────
  async function generatePreview(cloneId: string): Promise<string> {
    const ttsRes = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'qwen',
        voiceName: cloneId,
        text: CLONE_PREVIEW_SCRIPT
      })
    });

    if (!ttsRes.ok) {
      const err = await ttsRes.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? 'Failed to generate preview audio.');
    }

    const ttsData = await ttsRes.json() as { audioContent: string; format: string };

    if (!ttsData.audioContent) {
      throw new Error('TTS returned empty audio');
    }

    // Transcode WAV → MP3 via silence-removal endpoint (level: default)
    const transcodeRes = await fetch('/api/audio/silence-removal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Audio: ttsData.audioContent, level: 'default' })
    });

    if (!transcodeRes.ok) {
      // Fall back to raw WAV base64 if transcode fails
      return ttsData.audioContent;
    }

    const transcodeData = await transcodeRes.json() as { audioContent: string };
    
    if (!transcodeData.audioContent) {
      return ttsData.audioContent;
    }
    
    return transcodeData.audioContent;
  }

  // ── Create voice clone ────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!canCreate) return;
    if (atLimit) { showLimitModal = true; return; }

    isProcessing = true;
    processingMessage = 'Analysing recording...';
    errorMessage = '';

    // Switch message after 3s
    const msgTimeout = setTimeout(() => {
      processingMessage = 'Building voice clone...';
    }, 3000);

    let success = false;

    try {
      // Step 1: Transcode WebM→WAV if needed (DashScope doesn't accept WebM)
      // Audio is already prepared and transcoded to WAV by prepareAudioForCloning
      // in handleRecord() or handleFileSelected()
      const cloneBase64 = audioBase64;
      const cloneFormat = audioFormat; // Should always be 'audio/wav' now

      // Step 2: Register clone
      const cloneRes = await fetch('/api/tts/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: cloneBase64,
          audioFormat: cloneFormat,
          preferredName: voiceName.trim().toLowerCase().replace(/\s+/g, '_')
        })
      });

      if (!cloneRes.ok) {
        const err = await cloneRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to register voice clone.');
      }

      const { cloneId } = await cloneRes.json() as { cloneId: string };

      // Step 2: Generate preview
      const previewBase64 = await generatePreview(cloneId);

      // Step 3: Save to store
      const newVoice: CustomVoice = {
        id: cloneId,
        name: voiceName.trim(),
        country: country.trim(),
        previewAudio: previewBase64,
        createdAt: Date.now()
      };

      customVoices.update(voices => [newVoice, ...voices]);
      success = true;

    } catch (err) {
      showError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      clearTimeout(msgTimeout);
      isProcessing = false;
      processingMessage = '';
    }

    if (success) {
      cloneComplete = true;
      await new Promise(resolve => setTimeout(resolve, 2000));
      cloneComplete = false;
      resetRecording();
      voiceName = '';
      country = '';
      warningMessage = '';
    }
  }

  // ── Preview playback (completed rows) ────────────────────────────────────────
  function handlePlayPreview(voice: CustomVoice) {
    // Guard: no preview audio stored
    if (!voice.previewAudio) {
      console.warn('No preview audio available for voice:', voice.name);
      return;
    }

    if (playingPreviewId === voice.id) {
      previewAudio?.pause();
      previewAudio = null;
      playingPreviewId = null;
      return;
    }

    previewAudio?.pause();
    previewAudio = null;
    playingPreviewId = voice.id;

    try {
      // Strip data URI prefix if present
      let base64 = voice.previewAudio;
      if (base64.startsWith('data:')) {
        base64 = base64.split(',')[1];
      }

      const bytes = atob(base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      // Sniff MIME type: WAV starts with "RIFF" (0x52 0x49 0x46 0x46), MP3 otherwise
      const isWav = arr[0] === 0x52 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x46;
      const mimeType = isWav ? 'audio/wav' : 'audio/mp3';
      const blob = new Blob([arr], { type: mimeType });
      const audio = new Audio(URL.createObjectURL(blob));
      audio.onended = () => { playingPreviewId = null; previewAudio = null; };
      audio.onerror = () => { playingPreviewId = null; previewAudio = null; };
      audio.play();
      previewAudio = audio;
    } catch (err) {
      console.error('Failed to play preview:', err, 'voice:', voice.name);
      playingPreviewId = null;
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────────
  function openExportModal(voice: CustomVoice) {
    modalTargetVoice = voice;
    showExportModal = true;
  }

  function confirmExport() {
    if (!modalTargetVoice) return;
    const data = {
      voiceName: modalTargetVoice.name,
      country: modalTargetVoice.country,
      cloneId: modalTargetVoice.id
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${modalTargetVoice.name.toLowerCase().replace(/\s+/g, '-')}-voice-clone.json`;
    a.click();
    URL.revokeObjectURL(url);
    showExportModal = false;
    modalTargetVoice = null;
  }

  // ── Delete ────────────────────────────────────────────────────────────────────
  function openDeleteModal(voice: CustomVoice) {
    modalTargetVoice = voice;
    showDeleteModal = true;
  }

  async function confirmDelete() {
    if (!modalTargetVoice) return;
    const voiceId = modalTargetVoice.id;
    showDeleteModal = false;

    // Best-effort server-side deletion
    fetch('/api/tts/clone', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cloneId: voiceId })
    }).catch(() => { /* ignore */ });

    customVoices.update(voices => voices.filter(v => v.id !== voiceId));

    // If the deleted voice was selected, reset to first built-in voice
    selectedVoice.update(current => {
      if (current?.name === voiceId) {
        return ALL_VOICES[0] ?? null;
      }
      return current;
    });

    modalTargetVoice = null;
  }

  // ── Sorted voices (newest first) ──────────────────────────────────────────────
  let sortedVoices = $derived([...$customVoices].sort((a, b) => b.createdAt - a.createdAt));
</script>

<!-- Hidden file inputs -->
<input
  bind:this={fileInput}
  type="file"
  accept=".mp3,.wav"
  style="display:none"
  onchange={handleFileSelected}
/>
<input
  bind:this={jsonInput}
  type="file"
  accept=".json"
  style="display:none"
  onchange={handleJsonSelected}
/>

<!-- ── Panel ──────────────────────────────────────────────────────────────────── -->
<div class="clone-panel">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <button class="panel-header" type="button" onclick={() => clonePanelOpen = !clonePanelOpen}>
    <img
      src={clonePanelOpen ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'}
      alt=""
      class="chevron-icon"
    />
    <span>Voice clone</span>
  </button>

  {#if clonePanelOpen}
    <div class="panel-content">

      <!-- Quick start button -->
      <div class="read-first-row">
        <button class="read-first-btn" type="button" onclick={() => showReadFirst = true}>
          <span>Quick start</span>
          <span class="chevron-right">›</span>
        </button>
      </div>

      <!-- Form fields -->
      <div class="form-fields">
        <input
          class="text-input"
          type="text"
          placeholder="Voice name (max 15 chars)"
          maxlength="15"
          bind:value={voiceName}
          disabled={isProcessing}
        />
        <input
          class="text-input"
          type="text"
          placeholder="Country"
          bind:value={country}
          disabled={isProcessing}
        />
      </div>

      <!-- Action buttons row -->
      <div class="action-buttons">
        <button
          class="action-btn"
          type="button"
          onclick={handleRecord}
          disabled={isProcessing || recordingState === 'recording' || recordingState === 'countdown'}
          title="Record"
        >
          <img src="/icons/icon-mic.svg" alt="" class="btn-icon" />
          Record
        </button>
        <button
          class="action-btn"
          type="button"
          onclick={handleUploadClick}
          disabled={isProcessing || recordingState === 'recording' || recordingState === 'countdown'}
          title="Upload MP3/WAV"
        >
          <img src="/icons/icon-upload.svg" alt="" class="btn-icon" />
          Upload
        </button>
        <button
          class="action-btn"
          type="button"
          onclick={handleImportClick}
          disabled={isProcessing || recordingState === 'recording' || recordingState === 'countdown'}
          title="Import clone ID from JSON"
        >
          <img src="/icons/icon-upload.svg" alt="" class="btn-icon" />
          Import ID
        </button>
      </div>

      <!-- Progress bar -->
      <div class="progress-container">
        <div class="progress-bar-frame">
          <!-- Left icon area -->
          <div class="progress-icon-area">
            {#if recordingState === 'countdown'}
              <span class="countdown-number">{countdownValue}</span>
            {:else if recordingState === 'recording'}
              <button class="icon-btn stop-btn" type="button" onclick={handleStopButton} title="Stop recording">
                <img src="/icons/icon-square-new.svg" alt="Stop" class="icon-img" />
              </button>
            {:else if recordingState === 'done'}
              <button
                class="icon-btn play-btn"
                type="button"
                onclick={handlePlayRecording}
                title={isPlayingRecording ? 'Stop' : 'Play recording'}
              >
                <img
                  src={isPlayingRecording ? '/icons/icon-square-new.svg' : '/icons/icon-play-new.svg'}
                  alt={isPlayingRecording ? 'Stop' : 'Play'}
                  class="icon-img"
                />
              </button>
            {:else}
              <img src="/icons/icon-mic.svg" alt="" class="icon-img mic-idle" />
            {/if}
          </div>

          <!-- Progress fill -->
          <div class="progress-track">
            {#if recordingState === 'idle' || recordingState === 'countdown'}
              <span class="progress-placeholder">Speak clearly for 10–20s</span>
            {:else if recordingState === 'recording'}
              <div
                class="progress-fill"
                style="width: {progressPercent}%; background: {progressColor};"
              ></div>
            {:else if isProcessing}
              <span class="progress-placeholder">{processingMessage}</span>
            {/if}
          </div>

          <!-- Timer -->
          <div class="progress-timer">
            {#if recordingState !== 'idle'}
              <span>{recordingSeconds}s</span>
            {/if}
          </div>
        </div>
      </div>

      <!-- Warning message (upload >20s) -->
      {#if warningMessage}
        <p class="warning-message">{warningMessage}</p>
      {/if}

      <!-- Error message -->
      {#if errorMessage}
        <p class="error-message">{errorMessage}</p>
      {/if}

      <!-- Delete voice button -->
      <button
        class="delete-voice-btn"
        type="button"
        onclick={handleDeleteAudio}
        disabled={recordingState !== 'done' || isProcessing}
      >
        Delete voice
      </button>

      <!-- Create button -->
      <button
        class="create-btn"
        class:create-btn--active={isProcessing || cloneComplete}
        type="button"
        onclick={handleCreate}
        disabled={!canCreate && !isProcessing && !cloneComplete}
      >
        {#if cloneComplete}
          Clone complete
        {:else if isProcessing}
          <span class="btn-spinner"></span>
          {processingMessage}
        {:else}
          Create voice clone
        {/if}
      </button>

      <!-- Completed voice rows -->
      {#if sortedVoices.length > 0}
        <div class="voice-rows">
          {#each sortedVoices as voice (voice.id)}
            <div class="voice-row">
              <span class="voice-label">{voice.name} ({voice.country})</span>
              <div class="voice-row-actions">
                <button
                  class="row-icon-btn"
                  type="button"
                  onclick={() => handlePlayPreview(voice)}
                  title={playingPreviewId === voice.id ? 'Stop preview' : 'Play preview'}
                >
                  <img
                    src={playingPreviewId === voice.id ? '/icons/icon-pause-new.svg' : '/icons/icon-speak.svg'}
                    alt={playingPreviewId === voice.id ? 'Stop' : 'Preview'}
                    class="row-icon"
                  />
                </button>
                <button
                  class="row-icon-btn"
                  type="button"
                  onclick={() => openExportModal(voice)}
                  title="Export clone ID"
                >
                  <img src="/icons/icon-download.svg" alt="Export" class="row-icon" />
                </button>
                <button
                  class="row-icon-btn"
                  type="button"
                  onclick={() => openDeleteModal(voice)}
                  title="Delete voice"
                >
                  <img src="/icons/icon-trash.svg" alt="Delete" class="row-icon" />
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

    </div>
  {/if}
</div>

<!-- ── Read First Modal ───────────────────────────────────────────────────────── -->
{#if showReadFirst}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal-backdrop" onclick={() => showReadFirst = false} role="presentation">
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      <ul class="read-first-list">
        <li>Add a name and country, then record or upload 10–20 seconds of clean, fluent audio, with no background noise or echo. Recording stops automatically at 20 seconds. Longer uploads are trimmed.</li>
        <li>Upload MP3, WAV, M4V or MP4 files with single clear voice</li>
        <li>**Read the displayed script conversationally**, as if explaining something to a colleague — not as a script read.</li>
        <li>Each Clone ID is stored on your device and may be lost if you delete your device cache. Export if you wish to save or import the clone to another device.</li>
        <li>Cloned voices appear with a ★ in the dropdown list of voices. Delete cloned voices or export IDs below.</li>
      </ul>
      <button class="modal-btn modal-btn-primary" type="button" onclick={() => showReadFirst = false}>Got it</button>
    </div>
  </div>
{/if}

<!-- ── Export Modal ───────────────────────────────────────────────────────────── -->
{#if showExportModal}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal-backdrop" onclick={() => { showExportModal = false; modalTargetVoice = null; }} role="presentation">
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      <p class="modal-message">Export your voice clone ID?</p>
      <div class="modal-buttons">
        <button class="modal-btn modal-btn-ghost" type="button" onclick={() => { showExportModal = false; modalTargetVoice = null; }}>Cancel</button>
        <button class="modal-btn modal-btn-primary" type="button" onclick={confirmExport}>Export</button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Delete Modal ───────────────────────────────────────────────────────────── -->
{#if showDeleteModal}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal-backdrop" onclick={() => { showDeleteModal = false; modalTargetVoice = null; }} role="presentation">
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      <p class="modal-message">Delete your cloned voice?</p>
      <div class="modal-buttons">
        <button class="modal-btn modal-btn-ghost" type="button" onclick={() => { showDeleteModal = false; modalTargetVoice = null; }}>Cancel</button>
        <button class="modal-btn modal-btn-danger" type="button" onclick={confirmDelete}>Delete</button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Limit Modal ────────────────────────────────────────────────────────────── -->
{#if showLimitModal}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal-backdrop" onclick={() => showLimitModal = false} role="presentation">
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      <p class="modal-message">You have reached your limit of four active clones. Delete one and try again. Export to save a clone.</p>
      <div class="modal-buttons">
        <button class="modal-btn modal-btn-ghost" type="button" onclick={() => showLimitModal = false}>Cancel</button>
        <button class="modal-btn modal-btn-primary" type="button" onclick={() => showLimitModal = false}>Got it</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ── Panel shell ─────────────────────────────────────────────────────────── */
  .clone-panel {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--bg-white);
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    width: 100%;
    padding: var(--spacing-md);
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
    text-align: left;
    transition: background var(--transition-normal);
  }

  .panel-header:hover {
    background: var(--color-highlight);
  }

  .chevron-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .panel-content {
    padding: var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    border-top: 1px solid var(--color-border);
  }

  /* ── Read first ──────────────────────────────────────────────────────────── */
  .read-first-row {
    display: flex;
  }

  .read-first-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--font-size-base);
    color: var(--text-primary);
    padding: 0;
  }

  .read-first-btn:hover {
    color: var(--color-primary);
  }

  .chevron-right {
    color: var(--color-primary);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-bold);
    margin-left: 2px;
  }

  /* ── Form fields ─────────────────────────────────────────────────────────── */
  .form-fields {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .text-input {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-base);
    color: var(--text-primary);
    background: var(--bg-white);
    box-sizing: border-box;
    transition: border-color var(--transition-normal);
  }

  .text-input:focus {
    outline: none;
    border-color: var(--color-border-active);
  }

  .text-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ── Action buttons row ──────────────────────────────────────────────────── */
  .action-buttons {
    display: flex;
    gap: var(--spacing-sm);
  }

  .action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: var(--spacing-sm) var(--spacing-xs);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--bg-white);
    font-size: var(--font-size-base);
    color: var(--text-primary);
    cursor: pointer;
    transition: border-color var(--transition-normal), background var(--transition-normal);
    white-space: nowrap;
  }

  .action-btn:hover:not(:disabled) {
    border-color: var(--color-border-active);
    background: var(--color-highlight);
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  /* ── Progress bar ────────────────────────────────────────────────────────── */
  .progress-container {
    width: 100%;
  }

  .progress-bar-frame {
    display: flex;
    align-items: center;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    height: 40px;
    overflow: hidden;
    background: var(--bg-white);
  }

  .progress-icon-area {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-right: 1px solid var(--color-border);
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: none;
    border: none;
    cursor: pointer;
    border-radius: var(--radius-sm);
    padding: 0;
  }

  .icon-btn:hover {
    background: var(--color-highlight);
  }

  .icon-img {
    width: 20px;
    height: 20px;
  }

  .mic-idle {
    opacity: 0.3;
  }

  .countdown-number {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--color-primary);
    line-height: 1;
  }

  .progress-track {
    flex: 1;
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
    overflow: hidden;
  }

  .progress-placeholder {
    font-size: var(--font-size-base);
    color: var(--text-secondary);
    padding-left: var(--spacing-sm);
    white-space: nowrap;
  }

  .recording-script {
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    margin: 0;
    padding: 0 var(--spacing-sm);
    line-height: var(--line-height-normal);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .progress-fill {
    height: 100%;
    transition: width 0.3s ease, background 0.3s ease;
  }

  .progress-timer {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    padding: 0 var(--spacing-xs);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  /* ── Messages ────────────────────────────────────────────────────────────── */
  .error-message {
    font-size: var(--font-size-sm);
    color: #cc0000;
    margin: 0;
    line-height: var(--line-height-normal);
  }

  .warning-message {
    font-size: var(--font-size-sm);
    color: #996600;
    margin: 0;
    line-height: var(--line-height-normal);
  }

  /* ── Processing ──────────────────────────────────────────────────────────── */
  .processing-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .processing-text {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: var(--radius-round);
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Delete voice button ──────────────────────────────────────────────────── */
  .delete-voice-btn {
    align-self: flex-end;
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--font-size-md);
    color: var(--text-secondary);
    padding: 0;
    margin-bottom: var(--spacing-xsm);
    transition: color var(--transition-normal);
  }

  .delete-voice-btn:hover:not(:disabled) {
    color: #cc0000;
  }

  .delete-voice-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    pointer-events: none;
  }

  .create-btn {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: background var(--transition-normal), opacity var(--transition-normal);
    background: var(--color-border);
    color: var(--text-secondary);
    cursor: not-allowed;
    margin-top: var(--spacing-xsm);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    min-height: 40px;
  }

  .create-btn--active {
    background: var(--color-primary) !important;
    color: #ffffff !important;
    cursor: default !important;
  }

  .create-btn:not(:disabled):not(.create-btn--active) {
    background: var(--color-primary);
    color: #ffffff;
    cursor: pointer;
  }

  .create-btn:hover:not(:disabled):not(.create-btn--active) {
    background: #4a1d9e;
  }

  .btn-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: #ffffff;
    border-radius: var(--radius-round);
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  /* ── Voice rows ──────────────────────────────────────────────────────────── */
  .voice-rows {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    border-top: 1px solid var(--color-border);
    padding-top: var(--spacing-md);
  }

  .voice-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) 0;
  }

  .voice-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-primary);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .voice-row-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    flex-shrink: 0;
  }

  .row-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: none;
    border: none;
    cursor: pointer;
    border-radius: var(--radius-sm);
    padding: 0;
    transition: background var(--transition-normal);
  }

  .row-icon-btn:hover {
    background: var(--color-highlight);
  }

  .row-icon {
    width: 18px;
    height: 18px;
  }

  /* ── Modals ──────────────────────────────────────────────────────────────── */
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: var(--bg-white);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    max-width: 340px;
    width: calc(100% - 2rem);
    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .modal-message {
    font-size: var(--font-size-base);
    color: var(--text-primary);
    margin: 0;
    line-height: var(--line-height-normal);
  }

  .modal-buttons {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
  }

  .modal-btn {
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    border: none;
    transition: background var(--transition-normal);
  }

  .modal-btn-primary {
    background: var(--color-primary);
    color: #ffffff;
  }

  .modal-btn-primary:hover {
    background: #4a1d9e;
  }

  .modal-btn-ghost {
    background: none;
    color: var(--text-secondary);
    border: 1px solid var(--color-border);
  }

  .modal-btn-ghost:hover {
    background: var(--color-highlight);
    color: var(--text-primary);
  }

  .modal-btn-danger {
    background: #cc0000;
    color: #ffffff;
  }

  .modal-btn-danger:hover {
    background: #aa0000;
  }

  /* ── Read first list ─────────────────────────────────────────────────────── */
  .read-first-list {
    margin: 0;
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .read-first-list li {
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    line-height: var(--line-height-normal);
  }
</style>