cat > app.py << 'EOF'
#!/usr/bin/env python3
"""
Afro-TTS API Backend for AudioFlam
Running on Hugging Face Spaces with Gradio
"""

import gradio as gr
import torch
from TTS.api import TTS
import numpy as np
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load Afro-TTS model
logger.info("Loading Afro-TTS model...")
try:
    tts = TTS(model_name="tts_models/multilingual/multi-speaker/xtts_v2", gpu=True)
    logger.info("Model loaded successfully!")
except Exception as e:
    logger.error(f"Failed to load model: {e}")
    tts = None

def synthesize_speech(text: str) -> tuple:
    """
    Synthesize speech from text using Afro-TTS.
    Returns: (sample_rate, audio_array)
    """
    try:
        if tts is None:
            return None, "Error: Model not loaded"
        
        if not text.strip():
            return None, "Error: Please enter text"
        
        logger.info(f"Synthesizing: {text[:50]}...")
        
        # Generate speech
        wav = tts.tts(text=text, language="en")
        
        # Convert to numpy array if needed
        if isinstance(wav, list):
            wav = np.array(wav)
        
        # Ensure float32
        if wav.dtype != np.float32:
            wav = wav.astype(np.float32)
        
        logger.info("Synthesis complete")
        return (24000, wav), f"✓ Generated audio for: {text[:50]}..."
    
    except Exception as e:
        logger.error(f"Error: {e}")
        return None, f"Error: {str(e)}"

# Create Gradio interface
with gr.Blocks(title="AudioFlam TTS") as demo:
    gr.Markdown("# AudioFlam - Afro-TTS Backend")
    gr.Markdown("Generate speech in authentic African accents")
    
    with gr.Row():
        text_input = gr.Textbox(
            label="Text to synthesize",
            placeholder="Enter text here...",
            lines=3
        )
    
    with gr.Row():
        audio_output = gr.Audio(label="Generated Audio", type="numpy")
        status_output = gr.Textbox(label="Status", interactive=False)
    
    with gr.Row():
        generate_btn = gr.Button("Generate Speech", variant="primary")
    
    generate_btn.click(
        fn=synthesize_speech,
        inputs=[text_input],
        outputs=[audio_output, status_output]
    )

if __name__ == "__main__":
    demo.launch()
EOF