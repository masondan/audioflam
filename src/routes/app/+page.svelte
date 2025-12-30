<script lang="ts">
  import { NIGERIAN_VOICES, selectedLanguage, selectedVoice, textInput, isGenerating, audioResult } from '$lib/stores';
  import type { LanguageCode } from '$lib/stores';

  let currentLang = $state('en-NG');
  let currentVoiceName = $state('');
  let currentText = $state('');
  let loading = $state(false);
  let audioUrl = $state<string | null>(null);
  let errorMsg = $state<string | null>(null);

  // Sync with store
  $effect(() => {
     currentLang = $selectedLanguage;
     currentVoiceName = $selectedVoice?.name || '';
     currentText = $textInput;
  });

  function handleLanguageChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    const lang = target.value as LanguageCode;
    selectedLanguage.set(lang);
    // Reset voice to first option for new language
    selectedVoice.set(NIGERIAN_VOICES[lang][0]);
  }

  function handleVoiceChange(e: Event) {
      const target = e.target as HTMLSelectElement;
      const selectedDisplayName = target.value;
      const voice = NIGERIAN_VOICES[$selectedLanguage].find(v => v.displayName === selectedDisplayName);
      if (voice) selectedVoice.set(voice);
  }

  async function generateAudio() {
      if (!currentText.trim()) return;
      
      loading = true;
      errorMsg = null;
      isGenerating.set(true);

      try {
          const res = await fetch('/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  text: currentText,
                  voiceName: $selectedVoice?.name
              })
          });

          if (!res.ok) {
              const err = await res.json();
              throw new Error(err.error || 'Failed to generate');
          }

          const data = await res.json();
          // Convert base64 to blob url
          const byteCharacters = atob(data.audioContent);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'audio/mp3' });
          audioUrl = URL.createObjectURL(blob);
          audioResult.set(audioUrl);

      } catch (err: any) {
          console.error(err);
          errorMsg = err.message;
      } finally {
          loading = false;
          isGenerating.set(false);
      }
  }
</script>

<div class="app-container">
  <header class="app-header">
      <div class="brand">
        <img src="/icons/logo-audioflam-maskable.png" alt="Logo" class="mini-logo" />
        <span>AudioFlam</span>
      </div>
  </header>

  <main class="main-content">
      <div class="controls-card">
          <div class="control-group">
            <label for="language">Language</label>
            <select id="language" value={$selectedLanguage} onchange={handleLanguageChange}>
                <option value="en-NG">English (Nigeria)</option>
                <option value="ha-NG">Hausa</option>
                <option value="yo-NG">Yoruba</option>
            </select>
          </div>

          <div class="control-group">
            <label for="voice">Voice</label>
            <select id="voice" value={$selectedVoice?.displayName} onchange={handleVoiceChange}>
                {#each NIGERIAN_VOICES[$selectedLanguage] as voice}
                    <option value={voice.displayName}>{voice.displayName}</option>
                {/each}
            </select>
          </div>
      </div>

      <div class="input-area">
          <textarea 
            placeholder="Type your script here..." 
            bind:value={$textInput}
            rows="8"
          ></textarea>
      </div>

      <div class="action-area">
           {#if errorMsg}
             <p class="error-msg">{errorMsg}</p>
           {/if}

           <button class="primary-btn" onclick={generateAudio} disabled={loading || !$textInput}>
               {#if loading}
                 Generating...
               {:else}
                 Generate Audio
               {/if}
           </button>
      </div>

      {#if audioUrl}
        <div class="result-area">
            <audio controls src={audioUrl}>
                <track kind="captions" />
            </audio>
            <a href={audioUrl} download="audioflam-story.mp3" class="download-link">Download MP3</a>
        </div>
      {/if}
  </main>
</div>

<style>
  .app-container {
    max-width: 600px;
    margin: 0 auto;
    min-height: 100vh;
    background-color: var(--color-app-bg);
    display: flex;
    flex-direction: column;
  }

  .app-header {
    background-color: var(--color-white);
    padding: var(--spacing-md);
    box-shadow: var(--shadow-sm);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .brand {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      font-weight: 700;
      font-size: 1.1rem;
      color: var(--color-indigo-bloom);
  }

  .mini-logo {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-sm);
  }

  .main-content {
      padding: var(--spacing-md);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      flex: 1;
  }

  .controls-card {
      background: var(--color-white);
      padding: var(--spacing-md);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-sm);
      display: flex;
      gap: var(--spacing-md);
  }

  .control-group {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
  }

  label {
      font-size: 0.85rem;
      color: var(--color-text-secondary);
      font-weight: 500;
  }

  select {
      width: 100%;
      padding: 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      font-size: 1rem;
      background-color: white;
  }

  textarea {
      width: 100%;
      padding: var(--spacing-md);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      font-family: inherit;
      font-size: 1.1rem;
      resize: vertical;
      min-height: 200px;
  }

  textarea:focus {
      outline: 2px solid var(--color-indigo-bloom);
      border-color: transparent;
  }

  .primary-btn {
      width: 100%;
      background-color: var(--color-indigo-bloom);
      color: white;
      padding: 14px;
      font-size: 1.1rem;
      font-weight: 600;
      border-radius: var(--radius-full);
      box-shadow: var(--shadow-md);
      transition: transform 0.1s, opacity 0.2s;
  }

  .primary-btn:active {
      transform: scale(0.98);
  }

  .primary-btn:disabled {
      background-color: #ccc;
      cursor: not-allowed;
      box-shadow: none;
  }

  .result-area {
      background: var(--color-white);
      padding: var(--spacing-md);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-md);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--spacing-md);
      animation: slideUp 0.3s ease-out;
  }

  audio {
      width: 100%;
  }

  .download-link {
      color: var(--color-indigo-bloom);
      text-decoration: none;
      font-weight: 500;
  }

  .error-msg {
      color: #dc2626;
      text-align: center;
      font-size: 0.9rem;
      margin-bottom: var(--spacing-sm);
  }

  @keyframes slideUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
  }
</style>
