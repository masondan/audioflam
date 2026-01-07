declare module 'lamejs' {
	class Mp3Encoder {
		constructor(channels: number, sampleRate: number, bitRate: number);
		encode(samples: number[]): Uint8Array;
		finish(): Uint8Array;
	}

	export default Mp3Encoder;
}
