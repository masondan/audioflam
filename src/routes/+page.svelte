<script lang="ts">
  import { onMount } from 'svelte';
  import { ALL_VOICES, selectedVoice, textInput, preloadedTTSAudio } from '$lib/stores';
  import { timeStretch, audioBufferToWav } from '$lib/utils/timestretch';
  import type { VoiceOption } from '$lib/stores';
  import VoiceDropdown from '$lib/components/VoiceDropdown.svelte';
  import SpeedSlider from '$lib/components/SpeedSlider.svelte';
  import SilenceSlider from '$lib/components/SilenceSlider.svelte';
  import SpeedBlockModal from '$lib/components/SpeedBlockModal.svelte';
  import SpeedSilenceControls from '$lib/components/SpeedSilenceControls.svelte';
  import AudiogramPage from '$lib/components/AudiogramPage.svelte';
  import { removeSilence, concatenateAudioSegments, type SilenceLevel } from '$lib/audioProcessing';

  type SpeedLevel = 'default' | 'lively' | 'fast';
  type ActiveTab = 'tts' | 'audiogram';

  // Navigation state - restore from localStorage on mount
  let activeTab = $state<ActiveTab>('tts');

  onMount(() => {
    const saved = localStorage.getItem('activeTab');
    if (saved === 'tts' || saved === 'audiogram') {
      activeTab = saved;
    }
  });

  // Persist active tab across refreshes
  $effect(() => {
    localStorage.setItem('activeTab', activeTab);
  });

  // Reset audio when switching between single and two-speaker modes
  let previousTwoSpeakerMode = $state(false);
  
  $effect(() => {
    if (twoSpeakerMode !== previousTwoSpeakerMode) {
      previousTwoSpeakerMode = twoSpeakerMode;
      
      // Stop playback
      if (audioElement) {
        audioElement.pause();
        audioElement = null;
      }
      // Clear audio
      audioUrl = null;
      duration = 0;
      isPlaying = false;
      audioPlaylist = [];
      currentTrackIndex = 0;
      mergedAudioBase64 = null;
      originalMergedAudioBase64 = null;
      originalAudioBase64 = null;
      errorMsg = null;
      
      // Critical: reset lastGeneratedText so app knows to regenerate audio
      lastGeneratedText = '';
      
      // Reset controls
      singleSpeakerSpeed = 1.0;
      speaker1Speed = 1.0;
      speaker2Speed = 1.0;
      speaker1SilenceLevel = 'default';
      speaker2SilenceLevel = 'default';
      speedLevel = 'default';
      silenceLevel = 'default';
      
      // Clear speaker selections
      speaker1 = null;
      speaker2 = null;
      speaker1Open = false;
      speaker2Open = false;
      
      // Reset UI state
      adjustAudioOpen = false;
      showDownloadModal = false;
      downloadFilename = '';
      
      // Stop any preview audio
      if (speakerPreviewAudio) {
        speakerPreviewAudio.pause();
        speakerPreviewAudio = null;
      }
      speakerPreviewPlaying = null;
    }
  });
  
  function handleTwoSpeakerToggle() {
    twoSpeakerMode = !twoSpeakerMode;
  }

  // App state
  let hasTextInput = $state(false);
  let loading = $state(false);
  let audioUrl = $state<string | null>(null);
  let errorMsg = $state<string | null>(null);
  let editorRef: HTMLDivElement;
  
  let duration = $state(0);
  let isPlaying = $state(false);
  let audioElement = $state<HTMLAudioElement | null>(null);
  let lastGeneratedText = $state('');
  let originalAudioBase64 = $state<string | null>(null);
  
  let generationAbortController = $state<AbortController | null>(null);
  
  let twoSpeakerMode = $state(false);
  let speaker1 = $state<VoiceOption | null>(null);
  let speaker2 = $state<VoiceOption | null>(null);
  let speaker1Open = $state(false);
  let speaker2Open = $state(false);
  let speakerPreviewPlaying = $state<string | null>(null);
  let speakerPreviewAudio: HTMLAudioElement | null = null;
  
  let audioPlaylist = $state<PlaylistSegment[]>([]);
  let currentTrackIndex = $state(0);
  
  let singleSpeakerSpeed = $state(1.0);
  let speaker1Speed = $state(1.0);
  let speaker2Speed = $state(1.0);
  let speaker1SilenceLevel = $state<SilenceLevel>('default');
  let speaker2SilenceLevel = $state<SilenceLevel>('default');
  let mergedAudioBase64 = $state<string | null>(null);
  let originalMergedAudioBase64 = $state<string | null>(null);
  
  let speedLevel = $state<SpeedLevel>('default');
  let silenceLevel = $state<SilenceLevel>('default');
  
  let adjustAudioOpen = $state(false);
  
  const speedLevelValues: Record<SpeedLevel, number> = {
    default: 1.0,
    lively: 1.15,
    fast: 1.25
  };
  
  let showDownloadModal = $state(false);
  let downloadFilename = $state('');
  
  let showSpeedBlockModal = $state(false);

  function generateDefaultFilename(): string {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `audioflam-${day}${month}${year}-${hours}${minutes}.mp3`;
  }

  function openDownloadModal() {
    downloadFilename = generateDefaultFilename();
    showDownloadModal = true;
  }

  function closeDownloadModal() {
    showDownloadModal = false;
  }

  async function confirmDownload() {
    if (!audioUrl) return;
    
    try {
      let filename = downloadFilename.trim() || generateDefaultFilename();
      const response = await fetch(audioUrl);
      
      // Check if we need to apply time stretch (speed adjustment)
      const currentSpeed = twoSpeakerMode ? 1.0 : singleSpeakerSpeed;
      let downloadBlob: Blob;
      let extension: string;
      
      if (currentSpeed !== 1.0) {
        // Apply pitch-preserving time stretch
        const arrayBuffer = await response.arrayBuffer();
        const audioContext = new AudioContext();
        let audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        await audioContext.close();
        
        audioBuffer = await timeStretch(audioBuffer, currentSpeed);
        downloadBlob = audioBufferToWav(audioBuffer);
        extension = 'wav'; // Time-stretched audio is always WAV
        // Remove .mp3 extension and add .wav
        filename = filename.replace(/\.mp3$/i, '.wav');
      } else {
        // No time stretch needed - use original format
        downloadBlob = await response.blob();
        extension = twoSpeakerMode ? 'wav' : 'mp3';
        // Ensure correct extension for two-speaker mode
        if (twoSpeakerMode && !filename.endsWith('.wav')) {
          filename = filename.replace(/\.mp3$/i, '.wav');
        }
      }
      
      const blobUrl = URL.createObjectURL(downloadBlob);
      
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Clean up after a short delay
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    } catch (error) {
      console.error('Download failed:', error);
    }
    
    showDownloadModal = false;
  }

  function getFlagForVoice(voice: VoiceOption): string {
    if (voice.provider === 'azure') {
      if (voice.name.startsWith('en-NG')) return '🇳🇬';
      if (voice.name.startsWith('en-GB')) return '🇬🇧';
    }
    if (voice.provider === 'yarngpt') return '🇳🇬';
    return '';
  }

  function getPreviewFilename(voice: VoiceOption): string {
    const baseName = voice.displayName.split(' ')[0].split('(')[0].toLowerCase();
    return `/voices/${baseName}.mp3`;
  }

  function previewSpeakerVoice(event: MouseEvent, voice: VoiceOption) {
    event.stopPropagation();
    
    if (speakerPreviewPlaying === voice.name) {
      stopSpeakerPreview();
      return;
    }

    stopSpeakerPreview();
    speakerPreviewPlaying = voice.name;

    const previewUrl = getPreviewFilename(voice);
    speakerPreviewAudio = new Audio(previewUrl);
    
    speakerPreviewAudio.onended = () => {
      speakerPreviewPlaying = null;
    };
    
    speakerPreviewAudio.onerror = () => {
      speakerPreviewPlaying = null;
    };
    
    speakerPreviewAudio.play();
  }

  function stopSpeakerPreview() {
    if (speakerPreviewAudio) {
      speakerPreviewAudio.pause();
      speakerPreviewAudio = null;
    }
    speakerPreviewPlaying = null;
  }

  function handleSingleSpeakerSpeedChange(speed: number) {
    if (audioUrl === null) {
      showSpeedBlockModal = true;
      return;
    }
    singleSpeakerSpeed = speed;
    if (audioElement) {
      audioElement.playbackRate = speed;
    }
  }

  async function handleSpeaker1SpeedChange(speed: number) {
    if (audioUrl === null) {
      showSpeedBlockModal = true;
      return;
    }
    speaker1Speed = speed;
    await regenerateAndRestartTwoSpeakerAudio();
  }

  async function handleSpeaker2SpeedChange(speed: number) {
    if (audioUrl === null) {
      showSpeedBlockModal = true;
      return;
    }
    speaker2Speed = speed;
    await regenerateAndRestartTwoSpeakerAudio();
  }

  async function regenerateAndRestartTwoSpeakerAudio() {
    // Check if silence has been applied to two-speaker audio
    const hasSilenceAdjustment = twoSpeakerMode && 
      (speaker1SilenceLevel !== 'default' || speaker2SilenceLevel !== 'default');
    
    try {
      // Stop any currently playing audio
      if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }
      isPlaying = false;

      // If silence adjustment is active, we need to regenerate and reapply silence
      if (hasSilenceAdjustment && mergedAudioBase64) {
        // Process with current silence levels for both speakers
        let processedBlob = null;
        let processedAudio = mergedAudioBase64;
        
        if (speaker1SilenceLevel !== 'default') {
          const result = await removeSilence(processedAudio, speaker1SilenceLevel);
          processedBlob = result.blob;
          // Convert blob back to base64 for next iteration
          const arrayBuffer = await result.blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          let binaryString = '';
          const chunkSize = 8192;
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.subarray(i, i + chunkSize);
            binaryString += String.fromCharCode(...chunk);
          }
          processedAudio = btoa(binaryString);
        }
        
        if (speaker2SilenceLevel !== 'default') {
          const result = await removeSilence(processedAudio, speaker2SilenceLevel);
          processedBlob = result.blob;
          // Convert blob back to base64 for storage
          const arrayBuffer = await result.blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          let binaryString = '';
          const chunkSize = 8192;
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.subarray(i, i + chunkSize);
            binaryString += String.fromCharCode(...chunk);
          }
          processedAudio = btoa(binaryString);
        }
        
        // Update merged audio base64
        mergedAudioBase64 = processedAudio;
        
        // Clean up old URL and create new one
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
        }
        
        // Use the last processed blob
        if (processedBlob) {
          audioUrl = URL.createObjectURL(processedBlob);
        }
      }
      
      // Create new audio element (user will manually press play)
      if (audioUrl) {
        const newAudioElement = new Audio(audioUrl);
        newAudioElement.playbackRate = 1.0; // Speed applied per-segment in playNextTrack
        
        newAudioElement.addEventListener('loadedmetadata', () => {
          duration = newAudioElement.duration || 0;
        });
        newAudioElement.addEventListener('ended', () => {
          isPlaying = false;
          currentTrackIndex = 0;
        });
        newAudioElement.addEventListener('error', (e) => {
          errorMsg = 'Failed to load audio';
          isPlaying = false;
        });
        
        audioElement = newAudioElement;
        currentTrackIndex = 0;
      }
    } catch (err) {
      console.error('Failed to regenerate audio:', err);
      errorMsg = 'Failed to apply speed change';
      isPlaying = false;
    }
  }

  async function handleSpeaker1SilenceChange(level: SilenceLevel) {
    if (audioUrl === null) {
      showSpeedBlockModal = true;
      return;
    }
    await applyMergedAudioSilenceRemoval('speaker1', level);
  }

  async function handleSpeaker2SilenceChange(level: SilenceLevel) {
    if (audioUrl === null) {
      showSpeedBlockModal = true;
      return;
    }
    await applyMergedAudioSilenceRemoval('speaker2', level);
  }

  async function applyMergedAudioSilenceRemoval(speaker: 'speaker1' | 'speaker2', level: SilenceLevel) {
    if (!originalMergedAudioBase64) return;
    
    const previousLevel = speaker === 'speaker1' ? speaker1SilenceLevel : speaker2SilenceLevel;
    
    try {
      loading = true;
      
      // Stop any currently playing audio to avoid overlapping tracks
      if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }
      
      // Always process from the original audio
      let processedAudio = originalMergedAudioBase64;
      let lastResult = null;
      
      // Apply silence removal for speaker1 if needed
      if (level === 'default' && speaker === 'speaker1') {
        // Reverting to default for speaker1, use original
        const speaker2Level = speaker2SilenceLevel;
        if (speaker2Level !== 'default') {
          // Still need to apply speaker2 silence
          const result = await removeSilence(processedAudio, speaker2Level);
          lastResult = result;
          const arrayBuffer = await result.blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          let binaryString = '';
          const chunkSize = 8192;
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.subarray(i, i + chunkSize);
            binaryString += String.fromCharCode(...chunk);
          }
          processedAudio = btoa(binaryString);
        } else {
          // No speaker2 silence, use original as-is
          lastResult = await removeSilence(originalMergedAudioBase64, 'default');
        }
      } else if (level === 'default' && speaker === 'speaker2') {
        // Reverting to default for speaker2, use original
        const speaker1Level = speaker1SilenceLevel;
        if (speaker1Level !== 'default') {
          // Still need to apply speaker1 silence
          const result = await removeSilence(processedAudio, speaker1Level);
          lastResult = result;
          const arrayBuffer = await result.blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          let binaryString = '';
          const chunkSize = 8192;
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.subarray(i, i + chunkSize);
            binaryString += String.fromCharCode(...chunk);
          }
          processedAudio = btoa(binaryString);
        } else {
          // No speaker1 silence, use original as-is
          lastResult = await removeSilence(originalMergedAudioBase64, 'default');
        }
      } else {
        // Adjusting to a new silence level, apply all active silences from original
        const speaker1Level = speaker === 'speaker1' ? level : speaker1SilenceLevel;
        const speaker2Level = speaker === 'speaker2' ? level : speaker2SilenceLevel;
        
        if (speaker1Level !== 'default') {
          const result = await removeSilence(processedAudio, speaker1Level);
          lastResult = result;
          const arrayBuffer = await result.blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          let binaryString = '';
          const chunkSize = 8192;
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.subarray(i, i + chunkSize);
            binaryString += String.fromCharCode(...chunk);
          }
          processedAudio = btoa(binaryString);
        }
        
        if (speaker2Level !== 'default') {
          const result = await removeSilence(processedAudio, speaker2Level);
          lastResult = result;
          const arrayBuffer = await result.blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          let binaryString = '';
          const chunkSize = 8192;
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.subarray(i, i + chunkSize);
            binaryString += String.fromCharCode(...chunk);
          }
          processedAudio = btoa(binaryString);
        }
        
        // If no silences are active, use original
        if (speaker1Level === 'default' && speaker2Level === 'default') {
          lastResult = await removeSilence(originalMergedAudioBase64, 'default');
        }
      }
      
      // Update merged audio base64
      mergedAudioBase64 = processedAudio;
      
      // Clean up old URL
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      
      // Create new blob and URL from processed audio
      if (lastResult) {
        audioUrl = URL.createObjectURL(lastResult.blob);
      }
      
      // Create new audio element
      const newAudioElement = new Audio(audioUrl);
      const playbackRate = speaker === 'speaker1' ? speaker1Speed : speaker2Speed;
      newAudioElement.playbackRate = playbackRate;
      
      newAudioElement.addEventListener('loadedmetadata', () => {
        duration = newAudioElement.duration || 0;
        errorMsg = null; // Clear any previous errors once metadata loads
      });
      newAudioElement.addEventListener('ended', () => {
        isPlaying = false;
      });
      newAudioElement.addEventListener('error', (e) => {
        // Only show error if we're actually trying to play
        if (isPlaying) {
          errorMsg = 'Failed to load audio';
          isPlaying = false;
        }
      });
      
      audioElement = newAudioElement;
      
      // Update the appropriate silence level
      if (speaker === 'speaker1') {
        speaker1SilenceLevel = level;
      } else {
        speaker2SilenceLevel = level;
      }
    } catch (err) {
      console.error('Silence processing failed:', err);
      errorMsg = 'Failed to process silence removal';
      // Revert to previous level
      if (speaker === 'speaker1') {
        speaker1SilenceLevel = previousLevel;
      } else {
        speaker2SilenceLevel = previousLevel;
      }
    } finally {
      loading = false;
    }
  }

  function closeSpeeedBlockModal() {
    showSpeedBlockModal = false;
  }

  function handleSpeedLevelChange(level: SpeedLevel) {
    speedLevel = level;
    const playbackRate = speedLevelValues[level];
    singleSpeakerSpeed = playbackRate;
    if (audioElement) {
      audioElement.playbackRate = playbackRate;
    }
  }

  async function handleSilenceLevelChange(level: SilenceLevel) {
    const previousLevel = silenceLevel;
    silenceLevel = level;
    
    // If we have original audio and we're in single speaker mode, re-process it
    if (originalAudioBase64 && !twoSpeakerMode && audioUrl) {
      loading = true;
      
      try {
        // Stop any currently playing audio to avoid overlapping tracks
        if (audioElement) {
          audioElement.pause();
          audioElement.currentTime = 0;
        }
        
        // Process audio client-side using Web Audio API
        const result = await removeSilence(originalAudioBase64, level);
        
        // Clean up old URL
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
        }
        
        audioUrl = URL.createObjectURL(result.blob);
        
        const newAudioElement = new Audio(audioUrl);
        newAudioElement.playbackRate = singleSpeakerSpeed;
        
        newAudioElement.addEventListener('loadedmetadata', () => {
          duration = newAudioElement.duration || 0;
          errorMsg = null; // Clear any previous errors once metadata loads
        });
        newAudioElement.addEventListener('ended', () => {
          isPlaying = false;
        });
        newAudioElement.addEventListener('error', (e) => {
          // Only show error if we're actually trying to play
          if (isPlaying) {
            errorMsg = 'Failed to load audio';
            isPlaying = false;
          }
        });
        
        audioElement = newAudioElement;
      } catch (err) {
        console.error('Silence processing failed:', err);
        silenceLevel = previousLevel;
      } finally {
        loading = false;
      }
    }
  }

  function handleSpeedSilenceInactiveClick() {
    showSpeedBlockModal = true;
  }

  $effect(() => {
    hasTextInput = $textInput.trim().length > 0;
  });

  function handleVoiceChange(voice: VoiceOption) {
    selectedVoice.set(voice);
    invalidateAudio();
  }

  function invalidateAudio() {
    if (audioUrl || audioPlaylist.length > 0) {
      audioUrl = null;
      audioElement = null;
      isPlaying = false;
      lastGeneratedText = '';
      originalAudioBase64 = null;
      mergedAudioBase64 = null;
      audioPlaylist = [];
      currentTrackIndex = 0;
      singleSpeakerSpeed = 1.0;
      speaker1Speed = 1.0;
      speaker2Speed = 1.0;
      speaker1SilenceLevel = 'default';
      speaker2SilenceLevel = 'default';
      speedLevel = 'default';
      silenceLevel = 'default';
    }
  }

  function handleSpeaker1Change(voice: VoiceOption) {
    const providerChanged = speaker1 && speaker1.provider !== voice.provider;
    speaker1 = voice;
    speaker1Open = false;
    if (providerChanged && speaker2 && speaker2.provider !== voice.provider) {
      speaker2 = null;
    }
    invalidateAudio();
  }

  function toggleSpeaker1Dropdown() {
    speaker1Open = !speaker1Open;
    if (speaker1Open) {
      speaker2Open = false;
      setTimeout(() => {
        const dropdown = document.querySelector('[data-speaker="1"]');
        if (dropdown) {
          dropdown.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 0);
    }
  }

  function toggleSpeaker2Dropdown() {
    speaker2Open = !speaker2Open;
    if (speaker2Open) {
      speaker1Open = false;
      setTimeout(() => {
        const dropdown = document.querySelector('[data-speaker="2"]');
        if (dropdown) {
          dropdown.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 0);
    }
  }

  function handleSpeaker2Change(voice: VoiceOption) {
    speaker2 = voice;
    speaker2Open = false;
    invalidateAudio();
  }

  function handleEditorInput() {
    if (editorRef) {
      const newText = editorRef.innerText;
      textInput.set(newText);
      
      // Invalidate audio if text has changed from last generation
      if ((audioUrl || audioPlaylist.length > 0) && newText.trim() !== lastGeneratedText) {
        audioUrl = null;
        audioElement = null;
        audioPlaylist = [];
        isPlaying = false;
        lastGeneratedText = '';
      }
    }
  }

  function handleEditorFocus() {
    if (isPlaying && audioElement) {
      audioElement.pause();
      isPlaying = false;
    }
  }

  function handleVoiceDropdownOpen() {
    if (isPlaying && audioElement) {
      audioElement.pause();
      isPlaying = false;
    }
  }

  function skipBackward() {
    if (audioElement) {
      audioElement.currentTime = Math.max(0, audioElement.currentTime - 5);
    }
  }

  function skipForward() {
    if (audioElement) {
      audioElement.currentTime = Math.min(duration, audioElement.currentTime + 5);
    }
  }

  interface DialogueSegment {
    speaker: string;
    text: string;
    voice: VoiceOption;
  }

  function parseDialogue(text: string): DialogueSegment[] {
    const segments: DialogueSegment[] = [];
    const lines = text.split('\n');
    const speakerMap = new Map<string, VoiceOption>();
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      const colonIndex = trimmedLine.indexOf(':');
      if (colonIndex > 0 && colonIndex < 30) {
        const potentialSpeaker = trimmedLine.substring(0, colonIndex).trim();
        const dialogueText = trimmedLine.substring(colonIndex + 1).trim();
        
        if (potentialSpeaker && dialogueText) {
          const speakerKey = potentialSpeaker.toLowerCase();
          
          if (!speakerMap.has(speakerKey)) {
            if (speakerMap.size === 0 && speaker1) {
              speakerMap.set(speakerKey, speaker1);
            } else if (speakerMap.size === 1 && speaker2) {
              speakerMap.set(speakerKey, speaker2);
            }
          }
          
          const voice = speakerMap.get(speakerKey);
          if (voice) {
            segments.push({ speaker: potentialSpeaker, text: dialogueText, voice });
          }
          continue;
        }
      }
      
      if (segments.length > 0) {
        segments[segments.length - 1].text += ' ' + trimmedLine;
      } else if (speaker1) {
        segments.push({ speaker: 'Speaker 1', text: trimmedLine, voice: speaker1 });
      }
    }
    
    return segments;
  }

  interface PlaylistSegment {
    url: string;
    speaker: 'speaker1' | 'speaker2';
  }

  interface TwoSpeakerResult {
    segments: PlaylistSegment[];
    mergedUrl: string;
    totalDuration: number;
  }

  function getAudioDuration(url: string): Promise<number> {
    return new Promise((resolve) => {
      const audio = new Audio(url);
      audio.addEventListener('loadedmetadata', () => {
        resolve(audio.duration);
      });
      audio.addEventListener('error', () => {
        resolve(0);
      });
    });
  }

  async function generateTwoSpeakerAudio(signal: AbortSignal): Promise<TwoSpeakerResult | null> {
    const dialogueSegments = parseDialogue($textInput.trim());
    
    if (dialogueSegments.length === 0) {
      errorMsg = 'No dialogue segments found. Use format: Speaker: text';
      return null;
    }

    const segments: PlaylistSegment[] = [];
    const base64Audios: { base64Audio: string; speaker: 'speaker1' | 'speaker2' }[] = [];
    
    // Generate audio for all segments
    for (const segment of dialogueSegments) {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: segment.text,
          voiceName: segment.voice.name,
          provider: segment.voice.provider
        }),
        signal
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(`Failed for ${segment.speaker}: ${err.error || 'Unknown error'}`);
      }
      
      const data = await res.json();
      const isSpeaker1 = segment.voice === speaker1;
      
      base64Audios.push({
        base64Audio: data.audioContent,
        speaker: isSpeaker1 ? 'speaker1' : 'speaker2'
      });
    }
    
    // Normalize all audios to match peak levels
    const normalizeRes = await fetch('/api/normalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audios: base64Audios.map(a => ({
          base64Audio: a.base64Audio,
          label: a.speaker
        }))
      }),
      signal
    });

    if (!normalizeRes.ok) {
      const err = await normalizeRes.json();
      console.warn('Audio normalization failed, proceeding without normalization:', err);
    }

    let normalizedAudios = base64Audios;
    if (normalizeRes.ok) {
      const normalizeData = await normalizeRes.json();
      normalizedAudios = normalizeData.normalizedAudios.map((audio: any, idx: number) => ({
        base64Audio: audio.base64Audio,
        speaker: base64Audios[idx].speaker
      }));
    }

    // Apply per-speaker silence removal
    const processedAudios = [];
    for (const audioData of normalizedAudios) {
      const speakerSilenceLevel = audioData.speaker === 'speaker1' ? speaker1SilenceLevel : speaker2SilenceLevel;
      
      if (speakerSilenceLevel !== 'default') {
        const silenceRes = await fetch('/api/audio/silence-removal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64Audio: audioData.base64Audio,
            level: speakerSilenceLevel
          }),
          signal
        });
        
        if (silenceRes.ok) {
          const silenceData = await silenceRes.json();
          processedAudios.push({
            base64Audio: silenceData.audioContent,
            speaker: audioData.speaker
          });
        } else {
          processedAudios.push(audioData);
        }
      } else {
        processedAudios.push(audioData);
      }
    }
    normalizedAudios = processedAudios;

    // Convert normalized audios to segments for playlist playback
    for (let i = 0; i < normalizedAudios.length; i++) {
      const audioData = normalizedAudios[i];
      const byteCharacters = atob(audioData.base64Audio);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let j = 0; j < byteCharacters.length; j++) {
        byteArray[j] = byteCharacters.charCodeAt(j);
      }
      const blob = new Blob([byteArray], { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      
      segments.push({
        url,
        speaker: audioData.speaker
      });
    }
    
    const urls = segments.map(s => s.url);
    const durations = await Promise.all(urls.map(url => getAudioDuration(url)));
    const totalDuration = durations.reduce((acc, d) => acc + d, 0);
    
    // Properly concatenate audio segments using Web Audio API + lamejs encoding
    // This creates a single MP3 with correct duration metadata
    const mergedBlob = await concatenateAudioSegments(normalizedAudios.map(a => a.base64Audio));
    const mergedUrl = URL.createObjectURL(mergedBlob);
    
    // Convert merged blob to base64 for later silence removal
    const mergedArrayBuffer = await mergedBlob.arrayBuffer();
    const mergedUint8Array = new Uint8Array(mergedArrayBuffer);
    
    // Use chunked conversion to avoid "Maximum call stack size exceeded"
    let mergedBinaryString = '';
    const chunkSize = 8192;
    for (let i = 0; i < mergedUint8Array.length; i += chunkSize) {
      const chunk = mergedUint8Array.subarray(i, i + chunkSize);
      mergedBinaryString += String.fromCharCode(...chunk);
    }
    const mergedBase64 = btoa(mergedBinaryString);
    
    return { segments, mergedUrl, totalDuration, mergedBase64 };
    }

  function playNextTrack() {
    // Check if silence has been applied to two-speaker audio
    const hasSilenceAdjustment = twoSpeakerMode && 
      (speaker1SilenceLevel !== 'default' || speaker2SilenceLevel !== 'default');
    
    // If silence adjustment is active, play merged audio instead of segments
    if (hasSilenceAdjustment && audioUrl) {
      audioElement = new Audio(audioUrl);
      audioElement.addEventListener('ended', () => {
        isPlaying = false;
        currentTrackIndex = 0;
      });
      audioElement.play();
      return;
    }
    
    if (currentTrackIndex < audioPlaylist.length) {
      const segment = audioPlaylist[currentTrackIndex];
      audioElement = new Audio(segment.url);
      
      // Apply speed based on speaker
      const speed = segment.speaker === 'speaker1' ? speaker1Speed : speaker2Speed;
      audioElement.playbackRate = speed;
      
      audioElement.addEventListener('ended', () => {
        currentTrackIndex++;
        if (currentTrackIndex < audioPlaylist.length) {
          playNextTrack();
        } else {
          isPlaying = false;
          currentTrackIndex = 0;
        }
      });
      audioElement.play();
    }
  }

  async function generateAndPlay() {
    if (!$textInput.trim()) return;
    
    // Handle pause during generation
    if (loading && generationAbortController) {
      generationAbortController.abort();
      generationAbortController = null;
      loading = false;
      return;
    }
    
    if (isPlaying && audioElement) {
      audioElement.pause();
      isPlaying = false;
      return;
    }
    
    if (twoSpeakerMode && audioPlaylist.length > 0 && !isPlaying) {
      currentTrackIndex = 0;
      isPlaying = true;
      playNextTrack();
      return;
    }
    
    if (audioUrl && audioElement && !isPlaying) {
      audioElement.play();
      isPlaying = true;
      return;
    }
    
    // Only reset if generating new audio (not replaying existing)
    const isNewGeneration = lastGeneratedText !== $textInput.trim();
    
    if (isNewGeneration) {
      loading = true;
      errorMsg = null;
      audioUrl = null;
      audioPlaylist = [];
      mergedAudioBase64 = null;
      currentTrackIndex = 0;
      
      // Reset speed and silence controls when generating new audio
      singleSpeakerSpeed = 1.0;
      speaker1Speed = 1.0;
      speaker2Speed = 1.0;
      speaker1SilenceLevel = 'default';
      speaker2SilenceLevel = 'default';
      speedLevel = 'default';
      silenceLevel = 'default';
    } else {
      // Replaying existing audio - just update play state
      if (isPlaying && audioElement) {
        audioElement.pause();
        isPlaying = false;
        return;
      }
      isPlaying = true;
    }
    
    generationAbortController = new AbortController();
    
    try {
      if (twoSpeakerMode) {
        if (!speaker1 || !speaker2) {
          errorMsg = 'Please select both Speaker 1 and Speaker 2 voices';
          loading = false;
          return;
        }
        
        const result = await generateTwoSpeakerAudio(generationAbortController.signal);
        if (!result) {
          loading = false;
          return;
        }
        
        audioPlaylist = result.segments;
        audioUrl = result.mergedUrl;
        duration = result.totalDuration;
        // Store original unprocessed audio for later silence adjustments
        originalMergedAudioBase64 = result.mergedBase64;
        mergedAudioBase64 = result.mergedBase64;
        currentTrackIndex = 0;
        lastGeneratedText = $textInput.trim();
        isPlaying = true;
        playNextTrack();
      } else {
        const voice = $selectedVoice;
        
        if (!voice) {
          errorMsg = 'First select a voice and try again';
          loading = false;
          return;
        }
        
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: $textInput.trim(),
            voiceName: voice.name,
            provider: voice.provider
          }),
          signal: generationAbortController.signal
        });
        
        if (!res.ok) {
          const err = await res.json();
          const details = err.details ? `: ${err.details}` : '';
          throw new Error(`${err.error || 'Failed to generate'}${details}`);
        }
        
        const data = await res.json();
        let audioContent = data.audioContent;
        
        // Store original unprocessed audio for later silence adjustments
        originalAudioBase64 = audioContent;
        
        // Apply silence removal if not default
        // Process silence removal client-side using Web Audio API
        const result = await removeSilence(audioContent, silenceLevel);
        
        audioUrl = URL.createObjectURL(result.blob);
         
        audioElement = new Audio(audioUrl);
        audioElement.playbackRate = singleSpeakerSpeed;
        
        const handleLoadedMetadata = () => {
          duration = audioElement?.duration || 0;
        };
        const handleEnded = () => {
          isPlaying = false;
        };
        
        audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);
        audioElement.addEventListener('ended', handleEnded);
        audioElement.addEventListener('error', () => {
          errorMsg = 'Failed to load audio';
          isPlaying = false;
        });
         
        lastGeneratedText = $textInput.trim();
        audioElement.play();
        isPlaying = true;
      }
      
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error && err.name === 'AbortError') {
        errorMsg = null;
      } else {
        errorMsg = err instanceof Error ? err.message : 'Unknown error';
      }
    } finally {
      loading = false;
      generationAbortController = null;
    }
  }

  function clearText() {
    textInput.set('');
    if (editorRef) {
      editorRef.innerText = '';
    }
    hasTextInput = false;
    audioUrl = null;
    audioElement = null;
    isPlaying = false;
    duration = 0;
    lastGeneratedText = '';
    originalAudioBase64 = null;
    mergedAudioBase64 = null;
    originalMergedAudioBase64 = null;
    singleSpeakerSpeed = 1.0;
    speaker1Speed = 1.0;
    speaker2Speed = 1.0;
    speaker1SilenceLevel = 'default';
    speaker2SilenceLevel = 'default';
    speedLevel = 'default';
    silenceLevel = 'default';
  }

  async function addToAudiogram() {
    if (!audioUrl) return;
    
    try {
      // Fetch the audio and decode it to an AudioBuffer
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioContext = new AudioContext();
      let audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      await audioContext.close();
      
      // Apply pitch-preserving time stretch if speed is not 1.0
      const currentSpeed = twoSpeakerMode ? 1.0 : singleSpeakerSpeed;
      if (currentSpeed !== 1.0) {
        audioBuffer = await timeStretch(audioBuffer, currentSpeed);
      }
      
      // Get the voice name for reference
      const voiceName = twoSpeakerMode 
        ? `${speaker1?.displayName ?? ''} & ${speaker2?.displayName ?? ''}`
        : ($selectedVoice?.displayName ?? 'Unknown');
      
      // Store in the preloaded audio store
      preloadedTTSAudio.set({ buffer: audioBuffer, voiceName });
      
      // Switch to audiogram tab
      activeTab = 'audiogram';
    } catch (err) {
      console.error('Failed to prepare audio for audiogram:', err);
    }
  }
</script>



<div class="app-container">
  <header class="app-header">
    <img src="/icons/logotype-purple.png" alt="AudioFlam" class="logotype" />
    <nav class="nav-tabs">
      <button
        type="button"
        class="nav-tab-btn"
        class:active={activeTab === 'tts'}
        onclick={() => activeTab = 'tts'}
        aria-label="Text to Speech"
        aria-pressed={activeTab === 'tts'}
      >
        <img src="/icons/icon-tts.svg" alt="" class="nav-tab-icon" />
      </button>
      <button
        type="button"
        class="nav-tab-btn"
        class:active={activeTab === 'audiogram'}
        onclick={() => activeTab = 'audiogram'}
        aria-label="Audiogram"
        aria-pressed={activeTab === 'audiogram'}
      >
        <img src="/icons/icon-audiogram.svg" alt="" class="nav-tab-icon" />
      </button>
    </nav>
  </header>

  <main class="main-content">
    <div class="tab-panel" class:hidden={activeTab !== 'tts'}>
    
    <!-- Mode Toggle at Top -->
    <div class="mode-toggle-container">
      <button
        type="button"
        class="mode-toggle-btn"
        class:active={!twoSpeakerMode}
        onclick={() => {
          if (twoSpeakerMode) {
            handleTwoSpeakerToggle();
            adjustAudioOpen = false;
          }
        }}
        aria-pressed={!twoSpeakerMode}
        aria-label="One speaker mode"
      >
        One speaker
      </button>
      <button
        type="button"
        class="mode-toggle-btn"
        class:active={twoSpeakerMode}
        onclick={() => {
          if (!twoSpeakerMode) {
            handleTwoSpeakerToggle();
            adjustAudioOpen = false;
          }
        }}
        aria-pressed={twoSpeakerMode}
        aria-label="Two speakers mode"
      >
        Two speakers
      </button>
    </div>

    <!-- ONE SPEAKER MODE -->
    {#if !twoSpeakerMode}
      <div class="dropdowns-section">
        <VoiceDropdown
          label=""
          voices={ALL_VOICES}
          value={$selectedVoice}
          onchange={handleVoiceChange}
          onopen={handleVoiceDropdownOpen}
        />
      </div>
    {/if}

    <!-- TWO SPEAKER MODE - Speaker Dropdowns at Top -->
    {#if twoSpeakerMode}
      <div class="speaker-dropdowns-row-top">
        <div class="speaker-dropdown" data-speaker="1">
          <button
            type="button"
            class="speaker-dropdown-btn"
            onclick={toggleSpeaker1Dropdown}
          >
            <span>{speaker1 ? `1: ${getFlagForVoice(speaker1)} ${speaker1.displayName}` : 'Speaker 1'}</span>
            <img
              src={speaker1Open ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'}
              alt=""
              class="chevron-icon"
            />
          </button>
          {#if speaker1Open}
            <div class="speaker-dropdown-menu">
              {#each ALL_VOICES as voice}
                <div class="speaker-option-row">
                  <button
                    type="button"
                    class="speaker-option"
                    class:selected={speaker1?.name === voice.name}
                    onclick={() => handleSpeaker1Change(voice)}
                  >
                    <span class="voice-name"><span class="flag">{getFlagForVoice(voice)}</span>{voice.displayName}</span>
                    {#if voice.provider === 'azure'}
                      <span class="speed-badge">⚡</span>
                    {/if}
                  </button>
                  <button
                    type="button"
                    class="speaker-preview-btn"
                    class:playing={speakerPreviewPlaying === voice.name}
                    onclick={(e) => previewSpeakerVoice(e, voice)}
                    aria-label={`Preview ${voice.displayName}`}
                  >
                    <img 
                      src={speakerPreviewPlaying === voice.name ? '/icons/icon-speak-fill.svg' : '/icons/icon-speak.svg'} 
                      alt=""
                      class="speaker-preview-icon"
                    />
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <div class="speaker-dropdown" data-speaker="2">
          <button
            type="button"
            class="speaker-dropdown-btn"
            onclick={toggleSpeaker2Dropdown}
          >
            <span>{speaker2 ? `2: ${getFlagForVoice(speaker2)} ${speaker2.displayName}` : 'Speaker 2'}</span>
            <img
              src={speaker2Open ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'}
              alt=""
              class="chevron-icon"
            />
          </button>
          {#if speaker2Open}
            <div class="speaker-dropdown-menu">
              {#each ALL_VOICES.filter(v => !speaker1 || v.provider === speaker1.provider) as voice}
                <div class="speaker-option-row">
                  <button
                    type="button"
                    class="speaker-option"
                    class:selected={speaker2?.name === voice.name}
                    onclick={() => handleSpeaker2Change(voice)}
                  >
                    <span class="voice-name"><span class="flag">{getFlagForVoice(voice)}</span>{voice.displayName}</span>
                    {#if voice.provider === 'azure'}
                      <span class="speed-badge">⚡</span>
                    {/if}
                  </button>
                  <button
                    type="button"
                    class="speaker-preview-btn"
                    class:playing={speakerPreviewPlaying === voice.name}
                    onclick={(e) => previewSpeakerVoice(e, voice)}
                    aria-label={`Preview ${voice.displayName}`}
                  >
                    <img 
                      src={speakerPreviewPlaying === voice.name ? '/icons/icon-speak-fill.svg' : '/icons/icon-speak.svg'} 
                      alt=""
                      class="speaker-preview-icon"
                    />
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <div class="text-section">
      <div class="text-header">
        <span class="text-label" id="text-label">Text</span>
        <span class="char-count" class:warning={$textInput.length > 3200}>
          {$textInput.length}/4000
        </span>
      </div>
      <div class="text-editor-wrapper">
        <div 
          class="text-editor"
          contenteditable="true"
          bind:this={editorRef}
          oninput={handleEditorInput}
          onfocus={handleEditorFocus}
          role="textbox"
          aria-multiline="true"
          aria-labelledby="text-label"
        ></div>
        {#if twoSpeakerMode && !hasTextInput}
           <span class="text-placeholder">Use : to separate speakers. Example ...<br>Speaker 1: Hello<br>Speaker 2: Hello</span>
         {/if}
      </div>
      <div class="text-footer">
        {#if audioUrl && duration > 0}
          <span class="audio-duration">Audio duration: {duration.toFixed(1)}s</span>
        {:else}
          <span class="audio-duration"></span>
        {/if}
        <button 
          type="button" 
          class="clear-btn" 
          class:inactive={!hasTextInput}
          onclick={clearText}
          disabled={!hasTextInput}
        >Clear text</button>
      </div>
    </div>

    <div class="controls-section">
      {#if errorMsg}
        <p class="error-msg">{errorMsg}</p>
      {/if}

      <div class="player-row">
        <button 
          type="button" 
          class="skip-btn" 
          onclick={skipBackward}
          disabled={!audioElement}
          aria-label="Skip back 5 seconds"
        >
          <img src="/icons/icon-back-five.svg" alt="Back 5s" />
        </button>

        <button 
          type="button" 
          class="play-btn" 
          class:active={hasTextInput && !loading && !isPlaying}
          class:loading={loading}
          class:playing={isPlaying}
          onclick={generateAndPlay}
          disabled={!hasTextInput || $textInput.length > 4000}
        >
          {#if isPlaying || loading}
            <img src="/icons/icon-pause-fill.svg" alt="Pause" class="play-icon" />
          {:else}
            <img src="/icons/icon-play-fill.svg" alt="Play" class="play-icon" />
          {/if}
        </button>

        <button 
          type="button" 
          class="skip-btn" 
          onclick={skipForward}
          disabled={!audioElement}
          aria-label="Skip forward 5 seconds"
        >
          <img src="/icons/icon-forward-five.svg" alt="Forward 5s" />
        </button>
      </div>

      {#if loading && $selectedVoice?.provider === 'yarngpt'}
        <p class="loading-hint">Generating. This could take a minute<span class="loading-dots"></span></p>
      {/if}

      <!-- ADJUST AUDIO SECTION - Both Modes -->
      <div class="adjust-audio-section" class:inactive={audioUrl === null}>
        <button
          type="button"
          class="adjust-audio-header"
          class:inactive={audioUrl === null}
          onclick={() => { if (audioUrl) adjustAudioOpen = !adjustAudioOpen; }}
          aria-expanded={adjustAudioOpen && audioUrl !== null}
          disabled={audioUrl === null}
        >
          <span class="adjust-audio-label">Adjust audio</span>
          <img
            src={adjustAudioOpen && audioUrl ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'}
            alt=""
            class="adjust-audio-chevron"
          />
        </button>

        {#if adjustAudioOpen && audioUrl}
          <div class="adjust-audio-content">
            {#if !twoSpeakerMode}
              <!-- ONE SPEAKER: Speed and Silence sliders side-by-side -->
              <div class="adjust-audio-row">
                <div class="adjust-audio-slider">
                  <div class="slider-header">
                    <span class="slider-label-text">Speed</span>
                  </div>
                  <SpeedSlider
                    speed={singleSpeakerSpeed}
                    isActive={true}
                    onSpeedChange={handleSingleSpeakerSpeedChange}
                    size="small"
                  />
                </div>

                <div class="adjust-audio-slider">
                  <div class="slider-header">
                    <span class="slider-label-text">Silence</span>
                  </div>
                  <SilenceSlider
                    level={silenceLevel}
                    isActive={true}
                    onLevelChange={handleSilenceLevelChange}
                    size="small"
                  />
                </div>
              </div>
            {:else}
              <!-- TWO SPEAKER: Speaker 1 and Speaker 2 Speed, then Silence -->
              <div class="adjust-audio-column">
                <div class="adjust-audio-row">
                  <div class="adjust-audio-slider">
                    <div class="slider-header">
                      <span class="slider-label-text">1: Speed</span>
                    </div>
                    <SpeedSlider
                      speed={speaker1Speed}
                      isActive={!isPlaying}
                      onSpeedChange={handleSpeaker1SpeedChange}
                      size="small"
                    />
                  </div>

                  <div class="adjust-audio-slider">
                    <div class="slider-header">
                      <span class="slider-label-text">2: Speed</span>
                    </div>
                    <SpeedSlider
                      speed={speaker2Speed}
                      isActive={!isPlaying}
                      onSpeedChange={handleSpeaker2SpeedChange}
                      size="small"
                    />
                  </div>
                </div>

                <div class="adjust-audio-row">
                  <div class="adjust-audio-slider">
                    <div class="slider-header">
                      <span class="slider-label-text">1: Silence</span>
                    </div>
                    <SilenceSlider
                      level={speaker1SilenceLevel}
                      isActive={!isPlaying}
                      onLevelChange={handleSpeaker1SilenceChange}
                      size="small"
                    />
                  </div>

                  <div class="adjust-audio-slider">
                    <div class="slider-header">
                      <span class="slider-label-text">2: Silence</span>
                    </div>
                    <SilenceSlider
                      level={speaker2SilenceLevel}
                      isActive={!isPlaying}
                      onLevelChange={handleSpeaker2SilenceChange}
                      size="small"
                    />
                  </div>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <button
        type="button"
        class="download-btn"
        class:enabled={!!audioUrl}
        disabled={!audioUrl}
        onclick={openDownloadModal}
      >
        Download audio
      </button>

      <button
        type="button"
        class="audiogram-btn"
        class:enabled={!!audioUrl}
        disabled={!audioUrl}
        onclick={addToAudiogram}
      >
        Add to audiogram
      </button>
    </div>
    </div>
    <div class="tab-panel" class:hidden={activeTab !== 'audiogram'}>
      <AudiogramPage />
    </div>
  </main>
</div>

<SpeedBlockModal isOpen={showSpeedBlockModal} onDismiss={closeSpeeedBlockModal} />

{#if showDownloadModal}
  <div class="modal-overlay" role="presentation" onclick={closeDownloadModal} onkeydown={(e) => e.key === 'Escape' && closeDownloadModal()}>
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <h2 id="modal-title" class="modal-title">Download Audio</h2>
      
      <label class="modal-label" for="filename-input">Filename</label>
      <div class="filename-input-row">
        <input
          id="filename-input"
          type="text"
          class="filename-input"
          bind:value={downloadFilename}
          placeholder="audioflam-050126-1234"
        />
        <span class="filename-extension">.{twoSpeakerMode ? 'wav' : 'mp3'}</span>
      </div>

      <div class="modal-actions">
        <button type="button" class="modal-btn cancel" onclick={closeDownloadModal}>Cancel</button>
        <button type="button" class="modal-btn confirm" onclick={confirmDownload}>Download</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .app-container {
    max-width: 480px;
    margin: 0 auto;
    min-height: 100vh;
    background-color: var(--color-white);
  }

  .tab-panel {
    display: contents;
  }

  .tab-panel.hidden {
    display: none;
  }

  .app-header {
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--color-border-dark);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .logotype {
    height: 30px;
    width: auto;
  }

  .nav-tabs {
    display: flex;
    gap: var(--spacing-sm);
  }

  .nav-tab-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--color-border-dark);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .nav-tab-btn:hover {
    border-color: var(--color-primary);
  }

  .nav-tab-btn.active {
    background: var(--color-primary);
    border: none;
  }

  .nav-tab-icon {
    width: 24px;
    height: 24px;
    filter: invert(0.46);
  }

  .nav-tab-btn.active .nav-tab-icon {
    filter: brightness(0) invert(1);
  }

  .main-content {
    padding: var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .dropdowns-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    margin: 0;
    padding: 0;
  }



  .text-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .text-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .text-label {
    font-size: var(--font-size-sm);
    color: #555555;
    font-weight: 500;
  }

  .char-count {
    font-size: var(--font-size-xs);
    color: #777777;
  }

  .char-count.warning {
    color: #dc2626;
    font-weight: 500;
  }

  .text-editor-wrapper {
    position: relative;
  }

  .text-placeholder {
    position: absolute;
    top: var(--spacing-md);
    left: var(--spacing-md);
    color: #999999;
    font-size: var(--font-size-sm);
    pointer-events: none;
  }

  .text-editor {
    min-height: 150px;
    padding: var(--spacing-md);
    border: 1px solid #555555;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    line-height: 1.6;
    outline: none;
    transition: border-color var(--transition-fast);
    resize: vertical;
    overflow: auto;
  }

  .text-editor:focus {
    border-color: var(--color-primary);
  }

  .controls-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .error-msg {
    color: var(--color-primary);
    text-align: center;
    font-size: var(--font-size-sm);
  }

  .text-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .audio-duration {
    font-size: var(--font-size-sm);
    color: #777777;
  }

  .clear-btn {
    padding: 0;
    font-size: var(--font-size-sm);
    color: #777777;
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: none;
    transition: color var(--transition-fast);
  }

  .clear-btn:hover:not(:disabled) {
    color: #555555;
  }

  .clear-btn.inactive {
    color: #999999;
    cursor: default;
  }

  .loading-hint {
    text-align: center;
    font-size: var(--font-size-sm);
    color: #999999;
  }

  .loading-dots::after {
    content: '';
    display: inline-block;
    width: 12px;
    animation: dots 1.5s steps(4, end) infinite;
  }

  @keyframes dots {
    0%, 20% { content: ''; }
    40% { content: '.'; }
    60% { content: '..'; }
    80%, 100% { content: '...'; }
  }

  .player-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-lg);
  }

  .skip-btn {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: all var(--transition-fast);
  }

  .skip-btn img {
    width: 32px;
    height: 32px;
    filter: brightness(0) saturate(100%) invert(47%);
    transition: filter var(--transition-fast);
  }

  .skip-btn:hover:not(:disabled) img {
    filter: brightness(0) saturate(100%) invert(33%);
  }

  .skip-btn:disabled {
    cursor: default;
  }

  .skip-btn:disabled img {
    opacity: 0.4;
  }

  .play-btn {
    width: 50px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-white);
    border: 3px solid #777777 !important;
    border-radius: 50%;
    cursor: pointer;
    transition: border-color var(--transition-fast), background-color var(--transition-fast);
    flex-shrink: 0;
    position: relative;
    overflow: visible;
    -webkit-appearance: none;
    appearance: none;
  }

  .play-btn .play-icon {
    width: 40px;
    height: 40px;
    filter: brightness(0) saturate(100%) invert(47%);
    transition: filter var(--transition-fast);
    position: relative;
    z-index: 2;
    display: block;
    -webkit-filter: brightness(0) saturate(100%) invert(47%);
  }

  .play-btn.active {
    border-color: var(--color-primary) !important;
    background: var(--color-white);
  }

  .play-btn.active .play-icon {
    filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
    -webkit-filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
  }

  .play-btn.loading {
    border-color: transparent !important;
    background: transparent;
  }

  .play-btn.loading::before {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    background: conic-gradient(from 0deg, var(--color-primary), var(--color-lavender-veil), var(--color-primary));
    animation: spinner-rotate 1s linear infinite;
    z-index: 0;
  }

  .play-btn.loading::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: var(--color-white);
    z-index: 1;
  }

  .play-btn.loading .play-icon,
  .play-btn.playing .play-icon {
    filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
  }

  .play-btn.playing {
    border-color: var(--color-primary) !important;
  }

  @keyframes spinner-rotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .play-btn:disabled {
    cursor: not-allowed;
  }



  .download-btn {
    display: block;
    width: 100%;
    padding: var(--spacing-md);
    border: none;
    border-radius: var(--radius-md);
    background: var(--color-app-bg);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: not-allowed;
    transition: all var(--transition-fast);
  }

  .download-btn.enabled {
    background: var(--color-primary);
    color: var(--color-white);
    cursor: pointer;
  }

  .download-btn.enabled:hover {
    background: #4a1d9e;
  }

  .audiogram-btn {
    display: block;
    width: 100%;
    padding: var(--spacing-xs) 0;
    margin-top: calc(-1 * var(--spacing-sm));
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: not-allowed;
    transition: color var(--transition-fast);
  }

  .audiogram-btn.enabled {
    color: var(--color-primary);
    cursor: pointer;
  }

  .audiogram-btn.enabled:hover {
    text-decoration: underline;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--spacing-md);
  }

  .modal-content {
    background: var(--color-white);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    width: 100%;
    max-width: 320px;
    box-shadow: var(--shadow-lg);
  }

  .modal-title {
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--spacing-md) 0;
    text-align: center;
  }

  .modal-label {
    display: block;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: 500;
    margin-bottom: var(--spacing-xs);
  }

  .filename-input-row {
    display: flex;
    align-items: center;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    margin-bottom: var(--spacing-lg);
  }

  .filename-input {
    flex: 1;
    border: none;
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-base);
    outline: none;
  }

  .filename-input:focus {
    box-shadow: none;
  }

  .filename-extension {
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--color-app-bg);
    color: var(--color-text-secondary);
    font-size: var(--font-size-base);
    border-left: 1px solid var(--color-border);
  }

  .modal-actions {
    display: flex;
    gap: var(--spacing-sm);
  }

  .modal-btn {
    flex: 1;
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .modal-btn.cancel {
    background: var(--color-white);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
  }

  .modal-btn.cancel:hover {
    background: var(--color-app-bg);
  }

  .modal-btn.confirm {
    background: var(--color-primary);
    border: none;
    color: var(--color-white);
  }

  .modal-btn.confirm:hover {
    background: #4a1d9e;
  }



  .speaker-dropdown {
    flex: 1;
    position: relative;
    scroll-margin-bottom: 320px;
  }

  .speaker-dropdown-btn {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px var(--spacing-md);
    border: 1px solid #777777;
    border-radius: var(--radius-md);
    background: var(--color-white);
    font-size: var(--font-size-sm);
    font-weight: 500;
    line-height: 1.5;
    color: #777777;
    cursor: pointer;
    transition: border-color var(--transition-fast);
  }

  .speaker-dropdown-btn:hover {
    border-color: #555555;
    color: #555555;
  }

  .chevron-icon {
    width: 16px;
    height: 16px;
    opacity: 0.5;
  }

  .speaker-dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: var(--color-white);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    z-index: 100;
    max-height: 300px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .speaker-option-row {
    display: flex;
    align-items: center;
    width: 100%;
    border-bottom: 1px solid var(--color-border);
  }

  .speaker-option-row:last-child {
    border-bottom: none;
  }

  .speaker-option {
    flex: 1;
    display: flex;
    align-items: center;
    padding: var(--spacing-sm) var(--spacing-md);
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    transition: background var(--transition-fast);
  }

  .speaker-option:hover {
    background: var(--color-lavender-veil);
  }

  .speaker-option.selected {
    color: var(--color-primary);
    font-weight: 500;
  }

  .speaker-option .voice-name {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .speaker-option .flag {
    display: inline-block;
    width: 20px;
    text-align: center;
  }

  .speaker-option .speed-badge {
    font-size: 12px;
    margin-left: 4px;
  }

  .speaker-preview-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: none;
    border: none;
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .speaker-preview-icon {
    width: 20px;
    height: 20px;
    filter: invert(0.54) sepia(0.5) hue-rotate(248deg);
  }

  .speaker-preview-btn.playing .speaker-preview-icon {
    filter: invert(0.32) sepia(0.6) hue-rotate(248deg) saturate(1.5);
  }

  /* Mode Toggle Container */
  .mode-toggle-container {
    display: flex;
    gap: 0;
    border-radius: var(--radius-md);
    overflow: hidden;
    border: 1px solid var(--color-primary);
    width: 100%;
  }

  .mode-toggle-btn {
    flex: 1;
    padding: 12px var(--spacing-md);
    border: none;
    background: var(--color-white);
    color: var(--color-primary);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: background-color var(--transition-normal), color var(--transition-normal);
    text-align: center;
  }

  .mode-toggle-btn.active {
    background: var(--color-primary);
    color: var(--color-white);
  }

  .mode-toggle-btn:not(.active):hover {
    background: var(--color-lavender-veil);
  }

  /* Adjust Audio Section */
  .adjust-audio-section {
    border: 1px solid #777777;
    border-radius: var(--radius-md);
    background: var(--color-white);
    overflow: hidden;
    margin-bottom: var(--spacing-md);
    transition: border-color var(--transition-normal);
  }

  .adjust-audio-section.inactive {
    opacity: 0.5;
  }

  .adjust-audio-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px var(--spacing-md);
    background: none;
    border: none;
    cursor: pointer;
    transition: background var(--transition-normal);
    font-size: var(--font-size-sm);
    text-align: left;
  }

  .adjust-audio-header:hover:not(:disabled) {
    background: var(--color-lavender-veil);
  }

  .adjust-audio-header:disabled {
    cursor: not-allowed;
  }

  .adjust-audio-label {
    color: #777777;
    font-weight: 500;
    flex: 1;
  }

  .adjust-audio-chevron {
    width: 16px;
    height: 16px;
    filter: brightness(0) saturate(100%) invert(47%);
    transition: transform var(--transition-normal);
  }

  .adjust-audio-content {
    padding: 0 var(--spacing-md) var(--spacing-md);
    animation: slideDown var(--transition-normal);
  }

  .adjust-audio-row {
    display: flex;
    gap: var(--spacing-sm);
  }

  .adjust-audio-column {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .adjust-audio-slider {
    flex: 1;
  }

  .slider-header {
    margin-bottom: var(--spacing-xs);
  }

  .slider-label-text {
    font-size: var(--font-size-xs);
    color: #777777;
    font-weight: 500;
    display: block;
  }

  .discrete-slider {
    width: 100%;
    height: 6px;
    border-radius: var(--radius-full);
    background: #dcdcdc;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
    margin-bottom: var(--spacing-xs);
  }

  .discrete-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #5422b0;
    cursor: pointer;
    border: none;
    transform: translateY(-7px);
  }

  .discrete-slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #5422b0;
    cursor: pointer;
    border: none;
  }

  .discrete-slider::-webkit-slider-runnable-track {
    background: #efefef;
    height: 6px;
    border-radius: var(--radius-full);
  }

  .discrete-slider::-moz-range-track {
    background: transparent;
    border: none;
  }

  .slider-labels {
    display: flex;
    justify-content: space-between;
    gap: var(--spacing-xs);
  }

  .slider-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    transition: color var(--transition-fast), font-weight var(--transition-fast);
    flex: 1;
    text-align: center;
  }

  .slider-label.active {
    color: var(--color-primary);
    font-weight: 600;
  }

  /* Speaker Dropdowns Row for Two-Speaker Mode */
  .speaker-dropdowns-row-top {
    display: flex;
    flex-direction: row;
    gap: var(--spacing-sm);
    width: 100%;
    margin: 0;
    padding: 0;
  }

  .speaker-dropdowns-row-top .speaker-dropdown {
    flex: 1;
    position: relative;
    scroll-margin-bottom: 320px;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
