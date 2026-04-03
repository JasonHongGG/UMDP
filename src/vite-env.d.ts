/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS?: string;
	readonly UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_LEVEL?: string;
	readonly UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_CHANNELS?: string;
	readonly UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_ORIGINS?: string;
	readonly UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_CONSOLE?: string;
	readonly UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_BUFFER?: string;
	readonly UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_MAX_BUFFER?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

interface Window {
	__UNITY_MONO_STUDIO_DIAGNOSTICS__?: {
		storageKey: string;
		enable: (override?: Partial<{
			minimumLevel: 'debug' | 'info' | 'warn' | 'error';
			channels: string[] | null;
			origins: string[] | null;
			consoleOutput: boolean;
			captureBuffer: boolean;
			maxBufferEntries: number;
		}>) => unknown;
		disable: () => unknown;
		clearBuffer: () => void;
		getBuffer: () => unknown[];
		getPolicy: () => unknown;
		refresh: () => unknown;
	};
}
