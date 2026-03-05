<script lang="ts">
  import { get } from 'svelte/store';
  import { transcriptionSettingsStore } from '$lib/stores';
  import { decodeAudioFile, extractWaveformData, drawWaveform, type WaveformData } from '$lib/utils/waveform';
  import {
    requestMicrophonePermission,
    createAudioAnalyser,
    createMediaRecorder,
    blobToAudioBuffer,
    stopStream,
    getFrequencyData,
    drawLiveWaveform
  } from '$lib/utils/recording';
  import {
    loadWhisperModel,
    transcribeAudio,
    addTimestampsToTranscript,
    getWordCount,
    releaseModel,
    SUPPORTED_LANGUAGES,
    type TranscriptionSegment
  } from '$lib/utils/transcription';

  type RecordingPhase = 'idle' | 'ready' | 'countdown' | 'recording';
  type TranscribeState = 'idle' | 'transcribing' | 'complete';

  interface AudioData {
    file: File;
    url: string;
    duration: number;
    buffer: AudioBuffer;
    waveform: WaveformData;
  }

  // Audio state
  let audioData = $state<AudioData | null>(null);
  let audioLoading = $state(false);
  let isPlaying = $state(false);
  let currentTime = $state(0);

  // Trim state
  let trimStart = $state(0);
  let trimEnd = $state(1);
  let draggingHandle = $state<'start' | 'end' | null>(null);

  // Canvas/DOM refs
  let waveformCanvas = $state<HTMLCanvasElement | null>(null);
  let waveformContainer = $state<HTMLDivElement | null>(null);
  let audioElement: HTMLAudioElement | null = null;

  // Recording state
  let recordingPhase = $state<RecordingPhase>('idle');
  let countdownNumber = $state(3);
  let micError = $state<string | null>(null);

  // Recording resources
  let mediaStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let recordedChunks: Blob[] = [];
  let liveWaveformData: number[] = [];
  let recordingAnimationId: number | null = null;
  let lastBarTime = 0;
  const BAR_INTERVAL_MS = 100;

  // Transcription state
  let transcribeState = $state<TranscribeState>('idle');
  let transcript = $state('');
  let transcriptSegments = $state<TranscriptionSegment[]>([]);
  let wordCount = $state(0);
  let transcriptionError = $state<string | null>(null);
  let transcriptionStage = $state<string>('');
  let transcriptionCancelled = $state(false);

  // Settings state (local, synced from store)
  let settingsOpen = $state(false);
  let multilingualEnabled = $state(false);
  let quantized = $state(true);
  let selectedLanguage = $state('auto');
  let showTimestamps = $state(false);

  // Derived
  let hasAudio = $derived(audioData !== null);
  let isMicActive = $derived(recordingPhase !== 'idle');
  let isTranscribing = $derived(transcribeState === 'transcribing');
  let canTranscribe = $derived(hasAudio && transcribeState !== 'transcribing');

  // Sync settings from store on init
  $effect(() => {
    const unsub = transcriptionSettingsStore.subscribe((s) => {
      multilingualEnabled = s.multilingualEnabled;
      quantized = s.quantized;
      selectedLanguage = s.selectedLanguage;
      showTimestamps = s.showTimestamps;
    });
    return unsub;
  });

  // Persist settings changes
  function updateSettings() {
    transcriptionSettingsStore.set({
      multilingualEnabled,
      quantized,
      selectedLanguage,
      showTimestamps,
    });
  }

  // Draw waveform when canvas or audio data changes
  $effect(() => {
    if (waveformCanvas && audioData?.waveform && !isPlaying && recordingPhase === 'idle') {
      drawWaveform({
        canvas: waveformCanvas,
        peaks: audioData.waveform.peaks,
        playheadPosition: currentTime / audioData.duration,
        color: '#777777',
        trimStart,
        trimEnd,
      });
    }
  });

  // Playback position tracking
  $effect(() => {
    if (isPlaying && audioElement && audioData) {
      let animId: number;
      function tick() {
        if (audioElement && audioData) {
          currentTime = audioElement.currentTime;
          // Stop at trim end
          if (currentTime >= audioData.duration * trimEnd) {
            audioElement.pause();
            isPlaying = false;
            return;
          }
          if (waveformCanvas && audioData.waveform) {
            drawWaveform({
              canvas: waveformCanvas,
              peaks: audioData.waveform.peaks,
              playheadPosition: currentTime / audioData.duration,
              color: '#777777',
              trimStart,
              trimEnd,
            });
          }
        }
        animId = requestAnimationFrame(tick);
      }
      animId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(animId);
    }
  });

  // --- Audio file handling ---
  function handleAudioUploadClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,video/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        handleAudioFile(file);
      }
    };
    input.click();
  }

  async function handleAudioFile(file: File) {
    audioLoading = true;
    transcriptionError = null;
    try {
      const buffer = await decodeAudioFile(file);
      const waveform = await extractWaveformData(buffer);
      const url = URL.createObjectURL(file);

      if (audioData?.url) {
        URL.revokeObjectURL(audioData.url);
      }

      audioData = { file, url, duration: buffer.duration, buffer, waveform };
      trimStart = 0;
      trimEnd = 1;
      currentTime = 0;

      // Reset transcript when new audio loaded
      resetTranscript();
    } catch (err) {
      console.error('Failed to decode audio:', err);
      transcriptionError = 'Unable to process this audio file. Try a different format.';
    } finally {
      audioLoading = false;
    }
  }

  function handleAudioDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleAudioDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files[0];
    if (file && (file.type.startsWith('audio/') || file.type.startsWith('video/'))) {
      handleAudioFile(file);
    }
  }

  // --- Playback ---
  function handlePlayPause() {
    if (!audioData || isTranscribing) return;

    if (!audioElement) {
      audioElement = new Audio(audioData.url);
      audioElement.addEventListener('ended', () => { isPlaying = false; });
    }

    if (isPlaying) {
      audioElement.pause();
      isPlaying = false;
    } else {
      const startTime = audioData.duration * trimStart;
      if (currentTime < startTime || currentTime >= audioData.duration * trimEnd) {
        audioElement.currentTime = startTime;
        currentTime = startTime;
      }
      audioElement.play();
      isPlaying = true;
    }
  }

  function handleSkipBack() {
    if (!audioElement || !audioData) return;
    audioElement.currentTime = Math.max(audioData.duration * trimStart, audioElement.currentTime - 5);
    currentTime = audioElement.currentTime;
  }

  function handleSkipForward() {
    if (!audioElement || !audioData) return;
    audioElement.currentTime = Math.min(audioData.duration * trimEnd, audioElement.currentTime + 5);
    currentTime = audioElement.currentTime;
  }

  // --- Trim handles ---
  function handleTrimHandleMouseDown(handle: 'start' | 'end', e: MouseEvent) {
    if (isTranscribing) return;
    e.preventDefault();
    draggingHandle = handle;

    const onMove = (me: MouseEvent) => handleTrimDrag(me.clientX);
    const onUp = () => {
      draggingHandle = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleTrimHandleTouchStart(handle: 'start' | 'end', e: TouchEvent) {
    if (isTranscribing) return;
    e.preventDefault();
    draggingHandle = handle;

    const onMove = (te: TouchEvent) => handleTrimDrag(te.touches[0].clientX);
    const onEnd = () => {
      draggingHandle = null;
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }

  function handleTrimDrag(clientX: number) {
    if (!waveformContainer || !draggingHandle) return;
    const rect = waveformContainer.getBoundingClientRect();
    const handleWidth = 22;
    const usableWidth = rect.width - handleWidth * 2;
    const relX = clientX - rect.left - handleWidth;
    const ratio = Math.max(0, Math.min(1, relX / usableWidth));

    if (draggingHandle === 'start') {
      trimStart = Math.min(ratio, trimEnd - 0.01);
    } else {
      trimEnd = Math.max(ratio, trimStart + 0.01);
    }
  }

  // --- Waveform click to seek ---
  function handleWaveformClick(e: MouseEvent) {
    if (!audioData || !waveformContainer || isTranscribing) return;
    const rect = waveformContainer.getBoundingClientRect();
    const handleWidth = 22;
    const usableWidth = rect.width - handleWidth * 2;
    const relX = e.clientX - rect.left - handleWidth;
    const ratio = Math.max(trimStart, Math.min(trimEnd, relX / usableWidth));
    const newTime = audioData.duration * ratio;
    currentTime = newTime;
    if (audioElement) {
      audioElement.currentTime = newTime;
    }
  }

  function handleWaveformKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') handleSkipBack();
    else if (e.key === 'ArrowRight') handleSkipForward();
    else if (e.key === ' ') { e.preventDefault(); handlePlayPause(); }
  }

  // --- Delete audio ---
  function handleDeleteAudio() {
    if (audioData) {
      URL.revokeObjectURL(audioData.url);
      audioData = null;
    }
    if (audioElement) {
      audioElement.pause();
      audioElement = null;
    }
    isPlaying = false;
    trimStart = 0;
    trimEnd = 1;
    currentTime = 0;
    resetTranscript();
  }

  function resetTranscript() {
    transcribeState = 'idle';
    transcript = '';
    transcriptSegments = [];
    wordCount = 0;
    transcriptionError = null;
    transcriptionStage = '';
    transcriptionCancelled = false;
  }

  // --- Recording (mirrors AudiogramPage) ---
  async function handleMicClick() {
    if (hasAudio || isTranscribing) return;

    if (isMicActive) {
      // Cancel recording
      cancelRecording();
      return;
    }

    try {
      micError = null;
      mediaStream = await requestMicrophonePermission();
      const result = createAudioAnalyser(mediaStream);
      audioContext = result.audioContext;
      analyser = result.analyser;
      recordingPhase = 'ready';
    } catch (err) {
      micError = err instanceof Error ? err.message : 'Microphone error';
    }
  }

  function handleRecordPlayPause() {
    if (recordingPhase === 'ready') {
      startCountdown();
    } else if (recordingPhase === 'recording') {
      stopRecording();
    }
  }

  function startCountdown() {
    countdownNumber = 3;
    recordingPhase = 'countdown';

    const interval = setInterval(() => {
      countdownNumber--;
      if (countdownNumber <= 0) {
        clearInterval(interval);
        startRecording();
      }
    }, 1000);
  }

  function startRecording() {
    if (!mediaStream) return;

    recordedChunks = [];
    liveWaveformData = [];
    lastBarTime = 0;

    mediaRecorder = createMediaRecorder(mediaStream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = handleRecordingStop;
    mediaRecorder.start(100);

    recordingPhase = 'recording';
    animateLiveWaveform();
  }

  function animateLiveWaveform() {
    if (!analyser || recordingPhase !== 'recording') return;

    const now = performance.now();
    if (now - lastBarTime >= BAR_INTERVAL_MS) {
      const freqData = getFrequencyData(analyser);
      const avg = freqData.reduce((a, b) => a + b, 0) / freqData.length;
      liveWaveformData.push(avg);
      lastBarTime = now;
    }

    if (waveformCanvas) {
      const freqArray = new Uint8Array(liveWaveformData);
      drawLiveWaveform(waveformCanvas, freqArray, liveWaveformData.length);
    }

    recordingAnimationId = requestAnimationFrame(animateLiveWaveform);
  }

  async function stopRecording() {
    if (recordingAnimationId) {
      cancelAnimationFrame(recordingAnimationId);
      recordingAnimationId = null;
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }

  async function handleRecordingStop() {
    audioLoading = true;
    try {
      const blob = new Blob(recordedChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
      const buffer = await blobToAudioBuffer(blob);
      const waveform = await extractWaveformData(buffer);
      const url = URL.createObjectURL(blob);
      const file = new File([blob], `recording-${Date.now()}.webm`, { type: blob.type });

      audioData = { file, url, duration: buffer.duration, buffer, waveform };
      trimStart = 0;
      trimEnd = 1;
      currentTime = 0;
      resetTranscript();
    } catch (err) {
      console.error('Failed to process recording:', err);
      transcriptionError = 'Failed to process recording.';
    } finally {
      cleanupRecording();
      audioLoading = false;
    }
  }

  function cancelRecording() {
    if (recordingAnimationId) {
      cancelAnimationFrame(recordingAnimationId);
      recordingAnimationId = null;
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
    }
    cleanupRecording();
  }

  function cleanupRecording() {
    stopStream(mediaStream);
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    mediaStream = null;
    mediaRecorder = null;
    analyser = null;
    recordedChunks = [];
    liveWaveformData = [];
    recordingPhase = 'idle';
  }

  // --- Transcription ---
  async function handleTranscribe() {
    if (!audioData || isTranscribing) return;

    transcribeState = 'transcribing';
    transcript = '';
    transcriptSegments = [];
    wordCount = 0;
    transcriptionError = null;
    transcriptionCancelled = false;

    // Stop playback
    if (isPlaying && audioElement) {
      audioElement.pause();
      isPlaying = false;
    }

    try {
      const options = {
        multilingualEnabled,
        quantized,
        language: selectedLanguage,
      };

      transcriptionStage = 'Starting engine…';
      const pipe = await loadWhisperModel(options, (stage) => {
        if (transcriptionCancelled) return;
        transcriptionStage = stage === 'downloading' ? 'Downloading model…' : 'Model ready';
      });

      if (transcriptionCancelled) {
        transcribeState = 'idle';
        return;
      }

      transcriptionStage = 'Transcribing…';

      // Get trimmed audio blob
      const trimmedBlob = await getTrimmedAudioBlob();

      // Set up 5 minute timeout
      const timeoutMs = 5 * 60 * 1000;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
      );

      const result = await Promise.race([
        transcribeAudio(trimmedBlob, pipe, selectedLanguage, (partial) => {
          if (!transcriptionCancelled) {
            transcript = partial;
            wordCount = getWordCount(partial);
          }
        }),
        timeoutPromise,
      ]);

      if (transcriptionCancelled) {
        transcribeState = 'idle';
        return;
      }

      transcript = result.text;
      transcriptSegments = result.segments;
      wordCount = getWordCount(result.text);
      transcribeState = 'complete';
      transcriptionStage = '';
    } catch (err) {
      if (transcriptionCancelled) {
        transcribeState = 'idle';
        return;
      }
      console.error('Transcription failed:', err);
      if (err instanceof Error && err.message === 'TIMEOUT') {
        transcriptionError = 'Transcription timed out after 5 minutes. Try a shorter clip.';
      } else if (err instanceof Error && err.message.includes('memory')) {
        transcriptionError = 'Not enough memory. Try closing other tabs.';
      } else {
        transcriptionError = 'Transcription failed. Please try again.';
      }
      transcribeState = 'idle';
      transcriptionStage = '';
    }
  }

  async function getTrimmedAudioBlob(): Promise<Blob> {
    if (!audioData) throw new Error('No audio');

    const buffer = audioData.buffer;
    const startSample = Math.floor(trimStart * buffer.length);
    const endSample = Math.floor(trimEnd * buffer.length);
    const length = endSample - startSample;

    const offlineCtx = new OfflineAudioContext(
      buffer.numberOfChannels,
      length,
      buffer.sampleRate
    );
    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineCtx.destination);
    source.start(0, trimStart * buffer.duration, (trimEnd - trimStart) * buffer.duration);
    const trimmed = await offlineCtx.startRendering();

    // Convert to WAV blob
    const wavData = audioBufferToWav(trimmed);
    return new Blob([wavData], { type: 'audio/wav' });
  }

  function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = length * blockAlign;
    const headerSize = 44;
    const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(arrayBuffer);

    function writeString(offset: number, str: string) {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    }

    writeString(0, 'RIFF');
    view.setUint32(4, headerSize + dataSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return arrayBuffer;
  }

  function handleCancelTranscription() {
    transcriptionCancelled = true;
    transcribeState = 'idle';
    transcriptionStage = '';
  }

  // --- Transcript display ---
  let displayTranscript = $derived(
    showTimestamps && transcriptSegments.length > 0
      ? addTimestampsToTranscript(transcriptSegments)
      : transcript
  );

  function handleCopy() {
    navigator.clipboard.writeText(displayTranscript).then(() => {
      copyFeedback = 'Copied';
      setTimeout(() => { copyFeedback = ''; }, 2000);
    });
  }

  let copyFeedback = $state('');

  function handleDownload() {
    const blob = new Blob([displayTranscript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    a.href = url;
    a.download = `transcript-${day}${month}${year}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- Settings ---
  function toggleSettings() {
    settingsOpen = !settingsOpen;
  }

  function handleMultilingualToggle() {
    multilingualEnabled = !multilingualEnabled;
    if (!multilingualEnabled) {
      selectedLanguage = 'auto';
    }
    updateSettings();
  }

  function handleQuantizedToggle() {
    quantized = !quantized;
    updateSettings();
  }

  function handleLanguageChange(e: Event) {
    selectedLanguage = (e.target as HTMLSelectElement).value;
    updateSettings();
  }

  function handleTimestampsToggle() {
    showTimestamps = !showTimestamps;
    updateSettings();
  }
</script>

<div class="transcribe-page">
  <!-- Audio Upload / Recording (mirrors Audiogram exactly) -->
  {#if !audioData && recordingPhase === 'idle'}
    <button
      type="button"
      class="upload-box"
      class:loading={audioLoading}
      onclick={handleAudioUploadClick}
      ondragover={handleAudioDragOver}
      ondrop={handleAudioDrop}
      disabled={audioLoading}
    >
      {#if audioLoading}
        <span class="upload-label">Processing audio…</span>
        <div class="loading-spinner small"></div>
      {:else}
        <span class="upload-label">Audio</span>
        <img src="/icons/icon-upload.svg" alt="Upload" class="upload-icon" />
      {/if}
    </button>
  {:else if !audioData && recordingPhase === 'ready'}
    <div class="recording-box">
      <p class="recording-instructions">
        Tap Play to record. Tap Stop to end.<br />
        Tap refresh to start again.
      </p>
      {#if micError}
        <p class="mic-error">{micError}</p>
      {/if}
    </div>
  {:else if !audioData && (recordingPhase === 'countdown' || recordingPhase === 'recording')}
    <div class="recording-box recording-active" bind:this={waveformContainer}>
      {#if recordingPhase === 'countdown'}
        <div class="countdown-display">
          <span class="countdown-number">{countdownNumber}</span>
        </div>
      {:else}
        <div class="live-waveform-container">
          <canvas bind:this={waveformCanvas} class="waveform-canvas"></canvas>
          <div class="center-playhead"></div>
        </div>
      {/if}
    </div>
  {:else if audioLoading}
    <div class="recording-box">
      <span class="upload-label">Processing audio…</span>
      <div class="loading-spinner small"></div>
    </div>
  {:else}
    <!-- Waveform trimmer -->
    <div
      class="audio-waveform-container"
      bind:this={waveformContainer}
      onclick={handleWaveformClick}
      onkeydown={handleWaveformKeydown}
      role="slider"
      aria-label="Audio waveform"
      aria-valuemin={0}
      aria-valuemax={audioData?.duration ?? 0}
      aria-valuenow={currentTime}
      tabindex="0"
    >
      <div
        class="trim-handle start"
        class:disabled={isTranscribing}
        style="left: calc({trimStart} * (100% - 44px))"
        onmousedown={(e) => handleTrimHandleMouseDown('start', e)}
        ontouchstart={(e) => handleTrimHandleTouchStart('start', e)}
        role="slider"
        aria-label="Trim start"
        aria-valuemin={0}
        aria-valuemax={trimEnd}
        aria-valuenow={trimStart}
        tabindex="0"
      >
        <div class="trim-handle-bar"></div>
      </div>
      {#if trimStart > 0}
        <div class="trim-overlay start" style="width: calc({trimStart} * (100% - 44px))"></div>
      {/if}
      <canvas bind:this={waveformCanvas} class="waveform-canvas"></canvas>
      {#if trimEnd < 1}
        <div class="trim-overlay end" style="width: calc({1 - trimEnd} * (100% - 44px))"></div>
      {/if}
      <div
        class="trim-handle end"
        class:disabled={isTranscribing}
        style="left: calc(22px + {trimEnd} * (100% - 44px))"
        onmousedown={(e) => handleTrimHandleMouseDown('end', e)}
        ontouchstart={(e) => handleTrimHandleTouchStart('end', e)}
        role="slider"
        aria-label="Trim end"
        aria-valuemin={trimStart}
        aria-valuemax={1}
        aria-valuenow={trimEnd}
        tabindex="0"
      >
        <div class="trim-handle-bar"></div>
      </div>
    </div>
    <div class="audio-actions">
      <button type="button" class="text-btn" onclick={handleDeleteAudio} disabled={isTranscribing}>
        Delete audio
      </button>
      <span class="audio-duration">{audioData?.duration.toFixed(1)}s</span>
    </div>
  {/if}

  <!-- Playback Controls (mirrors Audiogram exactly) -->
  <div class="playback-controls">
    <div class="control-btn-spacer"></div>
    <div class="playback-center">
      <button
        type="button"
        class="control-btn skip"
        onclick={handleSkipBack}
        disabled={!hasAudio || isMicActive || isTranscribing}
        aria-label="Skip back 5 seconds"
      >
        <img src="/icons/icon-back-five.svg" alt="" class="control-icon" />
      </button>

      <button
        type="button"
        class="play-btn"
        class:active={hasAudio || isMicActive}
        class:playing={isPlaying || recordingPhase === 'recording'}
        onclick={isMicActive ? handleRecordPlayPause : handlePlayPause}
        disabled={(!hasAudio && !isMicActive) || isTranscribing}
        aria-label={recordingPhase === 'recording' ? 'Stop' : isPlaying ? 'Pause' : 'Play'}
      >
        {#if recordingPhase === 'countdown'}
          <img
            src="/icons/icon-{countdownNumber === 3 ? 'three' : countdownNumber === 2 ? 'two' : 'one'}.svg"
            alt={String(countdownNumber)}
            class="play-icon countdown-icon"
          />
        {:else if recordingPhase === 'recording'}
          <img src="/icons/icon-stop-fill.svg" alt="" class="play-icon" />
        {:else}
          <img
            src={isPlaying ? '/icons/icon-pause-fill.svg' : '/icons/icon-play-fill.svg'}
            alt=""
            class="play-icon"
          />
        {/if}
      </button>

      <button
        type="button"
        class="control-btn skip"
        onclick={handleSkipForward}
        disabled={!hasAudio || isMicActive || isTranscribing}
        aria-label="Skip forward 5 seconds"
      >
        <img src="/icons/icon-forward-five.svg" alt="" class="control-icon" />
      </button>
    </div>

    <button
      type="button"
      class="control-btn mic"
      class:active={isMicActive}
      onclick={handleMicClick}
      disabled={hasAudio || isTranscribing}
      aria-label="Record audio"
      aria-pressed={isMicActive}
    >
      <img
        src={isMicActive ? '/icons/icon-mic-fill.svg' : '/icons/icon-mic.svg'}
        alt=""
        class="control-icon"
      />
    </button>
  </div>

  <!-- Helper text (shown when no audio loaded and not recording) -->
  {#if !hasAudio && recordingPhase === 'idle' && !audioLoading}
    <p class="helper-text">
      Upload audio or video, or record your voice to transcribe. Multiple languages supported.
    </p>
  {/if}

  <!-- Error message -->
  {#if transcriptionError}
    <p class="error-msg">{transcriptionError}</p>
  {/if}

  <!-- Transcribe button + Cancel (shown when audio is loaded) -->
  {#if hasAudio}
    <div class="transcribe-section">
      <button
        type="button"
        class="transcribe-btn"
        class:active={canTranscribe}
        class:transcribing={isTranscribing}
        onclick={handleTranscribe}
        disabled={!canTranscribe}
      >
        {#if isTranscribing}
          <div class="transcribe-progress">
            <div class="loading-spinner small white"></div>
            <span>{transcriptionStage || 'Transcribing…'}</span>
          </div>
        {:else}
          Transcribe
        {/if}
      </button>
      {#if isTranscribing}
        <button
          type="button"
          class="cancel-text-btn active"
          onclick={handleCancelTranscription}
        >
          Cancel
        </button>
      {/if}
    </div>

    <!-- Language & Settings -->
    <div class="settings-section">
      <button type="button" class="settings-toggle" class:active={settingsOpen} onclick={toggleSettings}>
        <span>Language & Settings</span>
        <img
          src={settingsOpen ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'}
          alt=""
          class="chevron-icon"
        />
      </button>

      {#if settingsOpen}
        <div class="settings-panel">
          <!-- Quantized toggle -->
          <button type="button" class="setting-row" onclick={handleQuantizedToggle}>
            <img
              src={quantized ? '/icons/icon-checkbox-fill.svg' : '/icons/icon-checkbox-blank.svg'}
              alt=""
              class="checkbox-icon"
            />
            <div class="setting-text">
              <span class="setting-label">Optimise for speed</span>
              <span class="setting-desc">Smaller file size. Slightly less accurate.</span>
            </div>
          </button>

          <!-- Multilingual toggle -->
          <button type="button" class="setting-row" onclick={handleMultilingualToggle}>
            <img
              src={multilingualEnabled ? '/icons/icon-checkbox-fill.svg' : '/icons/icon-checkbox-blank.svg'}
              alt=""
              class="checkbox-icon"
            />
            <div class="setting-text">
              <span class="setting-label">Multilingual support</span>
              <span class="setting-desc">Enable for non-English audio</span>
            </div>
          </button>

          <!-- Language dropdown (only when multilingual) -->
          {#if multilingualEnabled}
            <div class="language-select-row">
              <label class="language-label" for="lang-select">Language</label>
              <select
                id="lang-select"
                class="language-select"
                value={selectedLanguage}
                onchange={handleLanguageChange}
              >
                {#each Object.entries(SUPPORTED_LANGUAGES) as [code, name]}
                  <option value={code}>{name}</option>
                {/each}
              </select>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Transcript Output (shown during/after transcription) -->
  {#if transcribeState === 'transcribing' || transcribeState === 'complete'}
    <div class="transcript-section">
      <span class="transcript-label">Transcript</span>
      <div class="transcript-window">
        <textarea
          class="transcript-textarea"
          value={displayTranscript}
          oninput={(e) => { transcript = (e.target as HTMLTextAreaElement).value; }}
          placeholder={isTranscribing ? 'Transcribing…' : 'No transcript yet'}
          readonly={isTranscribing}
        ></textarea>

        {#if transcribeState === 'complete'}
          <div class="transcript-actions">
            <div class="copy-btn-wrapper">
              {#if copyFeedback}
                <span class="copy-toast">{copyFeedback}</span>
              {/if}
              <button type="button" class="icon-action-btn" onclick={handleCopy} aria-label="Copy transcript">
                <img src="/icons/icon-copy.svg" alt="" class="action-icon" />
              </button>
            </div>
            <button type="button" class="icon-action-btn" onclick={handleDownload} aria-label="Download transcript">
              <img src="/icons/icon-download.svg" alt="" class="action-icon" />
            </button>
          </div>
        {/if}
      </div>

      <div class="transcript-footer">
        <button type="button" class="timestamp-toggle" onclick={handleTimestampsToggle}>
          <img
            src={showTimestamps ? '/icons/icon-checkbox-fill.svg' : '/icons/icon-checkbox-blank.svg'}
            alt=""
            class="checkbox-icon small"
          />
          <span>Add timestamps</span>
        </button>
        <span class="word-count">{wordCount} words</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .transcribe-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  /* --- Audio upload box (identical to Audiogram) --- */
  .upload-box {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-lg) var(--spacing-md);
    border: 2px dashed var(--text-secondary);
    border-radius: var(--radius-md);
    background: var(--bg-white);
    cursor: pointer;
    transition: border-color var(--transition-fast), background var(--transition-fast);
  }

  .upload-box:hover {
    border-color: var(--color-primary);
    background: var(--color-highlight);
  }

  .upload-box.loading {
    cursor: wait;
    opacity: 0.7;
  }

  .upload-label {
    font-size: var(--font-size-base);
    color: #1f1f1f;
    font-weight: var(--font-weight-medium);
  }

  .upload-icon {
    width: 24px;
    height: 24px;
    filter: invert(0.46);
  }

  /* --- Recording UI (identical to Audiogram) --- */
  .recording-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-md) var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--bg-white);
  }

  .recording-box.recording-active {
    padding: var(--spacing-sm) 0;
  }

  .recording-instructions {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    text-align: center;
    line-height: var(--line-height-normal);
    margin: 0;
  }

  .mic-error {
    font-size: var(--font-size-sm);
    color: #d32f2f;
    text-align: center;
    margin-top: var(--spacing-sm);
  }

  .countdown-display {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 60px;
  }

  .countdown-number {
    font-size: 2.5rem;
    font-weight: var(--font-weight-bold);
    color: var(--color-primary);
    animation: pulse 1s ease-in-out;
  }

  @keyframes pulse {
    0% { transform: scale(1.2); opacity: 0.7; }
    50% { transform: scale(1); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }

  .countdown-icon {
    filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%) !important;
  }

  .live-waveform-container {
    position: relative;
    width: 100%;
  }

  .center-playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 2px;
    background: var(--color-primary);
    transform: translateX(-50%);
    pointer-events: none;
    z-index: 5;
  }

  /* --- Waveform trimmer (identical to Audiogram) --- */
  .audio-waveform-container {
    position: relative;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-md);
    padding: var(--spacing-sm) 22px;
    background: var(--bg-white);
    cursor: pointer;
    touch-action: pan-y;
  }

  .waveform-canvas {
    width: 100%;
    height: 60px;
    display: block;
  }

  .trim-overlay {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--bg-white);
    z-index: 5;
    pointer-events: none;
  }

  .trim-overlay.start {
    left: 22px;
  }

  .trim-overlay.end {
    right: 22px;
  }

  .trim-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 22px;
    cursor: ew-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    touch-action: none;
    background: var(--color-primary);
  }

  .trim-handle.start {
    border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  }

  .trim-handle.end {
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  }

  .trim-handle-bar {
    width: 4px;
    height: 28px;
    background: var(--bg-white);
    border-radius: 2px;
  }

  .trim-handle:hover:not(.disabled),
  .trim-handle:focus:not(.disabled) {
    background: color-mix(in srgb, var(--color-primary) 85%, black);
  }

  .trim-handle.disabled {
    background: #777777;
    cursor: default;
    pointer-events: none;
  }

  .audio-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0;
    margin-top: calc(-1 * var(--spacing-md) + var(--spacing-sm));
  }

  .audio-duration {
    font-size: var(--font-size-xs);
    color: #555555;
  }

  .text-btn {
    background: none;
    border: none;
    padding: var(--spacing-xs) 0;
    font-size: var(--font-size-sm);
    color: var(--color-primary);
    cursor: pointer;
    transition: color var(--transition-fast);
  }

  .text-btn:hover:not(:disabled) {
    color: #4a1d9e;
  }

  .text-btn:disabled {
    color: #777777;
    cursor: default;
  }

  /* --- Playback controls (identical to Audiogram) --- */
  .playback-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) 0;
  }

  .playback-center {
    display: flex;
    align-items: center;
    gap: var(--spacing-lg);
  }

  .control-btn-spacer {
    width: 40px;
    height: 40px;
  }

  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: all var(--transition-fast);
  }

  .control-btn:disabled {
    cursor: default;
  }

  .control-btn:disabled .control-icon {
    opacity: 0.4;
  }

  .control-btn:hover:not(:disabled) .control-icon {
    filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
  }

  .control-btn.mic.active .control-icon {
    filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
  }

  .control-icon {
    width: 32px;
    height: 32px;
    filter: invert(46%) sepia(0%) saturate(0%) brightness(97%) contrast(89%);
    transition: filter var(--transition-fast);
  }

  .play-btn {
    width: 50px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-white);
    border: 3px solid #999999 !important;
    border-radius: var(--radius-round);
    cursor: pointer;
    transition: border-color var(--transition-fast), background-color var(--transition-fast);
    flex-shrink: 0;
    -webkit-appearance: none;
    appearance: none;
  }

  .play-btn:disabled {
    cursor: not-allowed;
  }

  .play-btn.active {
    border-color: var(--color-primary) !important;
    background: var(--bg-white);
  }

  .play-btn.active .play-icon {
    filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
    -webkit-filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
  }

  .play-btn.active:disabled {
    border-color: #777777 !important;
  }

  .play-btn.active:disabled .play-icon {
    filter: invert(46%) sepia(0%) saturate(0%) brightness(97%) contrast(89%);
    -webkit-filter: invert(46%) sepia(0%) saturate(0%) brightness(97%) contrast(89%);
  }

  .play-btn.playing {
    border-color: var(--color-primary) !important;
  }

  .play-btn.playing .play-icon {
    filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
  }

  .play-icon {
    width: 40px;
    height: 40px;
    filter: brightness(0) saturate(100%) invert(20%);
    transition: filter var(--transition-fast);
    display: block;
    -webkit-filter: brightness(0) saturate(100%) invert(20%);
  }

  /* --- Helper text --- */
  .helper-text {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    text-align: center;
    line-height: var(--line-height-normal);
    margin: 0;
    padding: 0 var(--spacing-md);
  }

  .error-msg {
    color: #d32f2f;
    text-align: center;
    font-size: var(--font-size-sm);
    margin: 0;
  }

  /* --- Transcribe button --- */
  .transcribe-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .transcribe-btn {
    width: 100%;
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
    background: var(--bg-main);
    border: none;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: #777777;
    cursor: not-allowed;
    transition: all var(--transition-fast);
  }

  .transcribe-btn.active {
    background: var(--color-primary);
    color: var(--bg-white);
    cursor: pointer;
  }

  .transcribe-btn.active:hover {
    background: #4a1d9e;
  }

  .transcribe-btn.transcribing {
    background: var(--color-primary);
    color: var(--bg-white);
    cursor: default;
  }

  .transcribe-progress {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
  }

  .cancel-text-btn {
    align-self: flex-start;
    background: none;
    border: none;
    padding: var(--spacing-xs) 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: #777777;
    cursor: not-allowed;
    transition: color var(--transition-fast);
  }

  .cancel-text-btn.active {
    color: var(--color-primary);
    cursor: pointer;
  }

  .cancel-text-btn.active:hover {
    text-decoration: underline;
  }

  /* --- Language & Settings --- */
  .settings-section {
    display: flex;
    flex-direction: column;
  }

  .settings-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs);
    width: 100%;
    padding: var(--spacing-sm) 0;
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
    transition: color var(--transition-fast);
  }

  .settings-toggle.active {
    color: var(--color-primary);
  }

  .settings-toggle.active .chevron-icon {
    filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
  }

  .chevron-icon {
    width: 16px;
    height: 16px;
    filter: invert(0.43);
  }

  .settings-panel {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) 0 var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-md);
  }

  .setting-row {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-sm);
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--spacing-xs) 0;
    text-align: left;
  }

  .checkbox-icon {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .checkbox-icon.small {
    width: 18px;
    height: 18px;
  }

  .setting-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .setting-label {
    font-size: var(--font-size-base);
    color: var(--text-primary);
    font-weight: var(--font-weight-medium);
  }

  .setting-desc {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    line-height: var(--line-height-normal);
  }

  .language-select-row {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    padding-top: var(--spacing-xs);
  }

  .language-label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    font-weight: var(--font-weight-medium);
  }

  .language-select {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--bg-white);
    font-size: var(--font-size-base);
    color: var(--text-primary);
    font-family: inherit;
    outline: none;
    appearance: none;
    -webkit-appearance: none;
    background-image: url('/icons/icon-expand.svg');
    background-repeat: no-repeat;
    background-position: right var(--spacing-sm) center;
    background-size: 16px;
    padding-right: 36px;
    cursor: pointer;
    transition: border-color var(--transition-fast);
  }

  .language-select:focus {
    border-color: var(--color-primary);
  }

  /* --- Transcript output --- */
  .transcript-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    flex: 1;
    min-height: 0;
  }

  .transcript-label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    font-weight: var(--font-weight-medium);
  }

  .transcript-window {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--bg-white);
    overflow: hidden;
    flex: 1;
    min-height: 50vh;
  }

  .transcript-textarea {
    width: 100%;
    flex: 1;
    min-height: 0;
    padding: var(--spacing-md);
    border: none;
    background: transparent;
    font-size: var(--font-size-base);
    font-family: inherit;
    color: var(--text-primary);
    line-height: var(--line-height-relaxed);
    outline: none;
    resize: none;
    white-space: pre-wrap;
  }

  .transcript-textarea[readonly] {
    cursor: default;
  }

  .transcript-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-lg);
    padding: var(--spacing-sm);
    border-top: 1px solid var(--color-border);
    background: var(--bg-white);
    flex-shrink: 0;
  }

  .copy-btn-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .copy-toast {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 4px;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-primary);
    background: var(--color-highlight);
    padding: 3px 10px;
    border-radius: var(--radius-sm);
    white-space: nowrap;
    pointer-events: none;
    animation: toastFade 2s ease forwards;
  }

  @keyframes toastFade {
    0%, 70% { opacity: 1; }
    100% { opacity: 0; }
  }

  .icon-action-btn {
    display: flex;
    align-items: center;
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--spacing-xs);
    transition: opacity var(--transition-fast);
  }

  .icon-action-btn:hover {
    opacity: 0.7;
  }

  .action-icon {
    width: 22px;
    height: 22px;
    filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
  }

  .transcript-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0;
  }

  .timestamp-toggle {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--spacing-xs) 0;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    font-weight: var(--font-weight-medium);
  }

  .word-count {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  /* --- Spinner --- */
  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: var(--radius-round);
    animation: spin 0.8s linear infinite;
  }

  .loading-spinner.small {
    width: 20px;
    height: 20px;
    border-width: 2px;
  }

  .loading-spinner.white {
    border-color: rgba(255, 255, 255, 0.3);
    border-top-color: white;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
