/* tslint:disable */
/* eslint-disable */

export class WasmFft {
    free(): void;
    [Symbol.dispose](): void;
    calculate_coherence(mic_mag: Float32Array, mic_phase: Float32Array, ap_mag_ptr: number, ap_phase_ptr: number): void;
    calculate_delay(sample_rate: number): number;
    calculate_lufs(freq_data_db: Float32Array, hz_per_bin: number): number;
    coherence_ptr(): number;
    delay_data_ptr(): number;
    /**
     * マグニチュード（振幅）バッファのポインタを取得
     */
    magnitude_ptr(): number;
    constructor(size: number);
    /**
     * フェーズ（位相）バッファのポインタを取得
     */
    phase_ptr(): number;
    /**
     * FFTを実行し、振幅と位相を計算する
     */
    process(): void;
    process_db(alpha: number, n: number, output: Float32Array): void;
    /**
     * JS側から入力データ（Float32Array）を渡してセットする
     */
    set_input(input_data: Float32Array): void;
    smooth_coherence(alpha: number, output: Float32Array): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmfft_free: (a: number, b: number) => void;
    readonly wasmfft_calculate_coherence: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly wasmfft_calculate_delay: (a: number, b: number) => number;
    readonly wasmfft_calculate_lufs: (a: number, b: number, c: number, d: number) => number;
    readonly wasmfft_coherence_ptr: (a: number) => number;
    readonly wasmfft_delay_data_ptr: (a: number) => number;
    readonly wasmfft_magnitude_ptr: (a: number) => number;
    readonly wasmfft_new: (a: number) => number;
    readonly wasmfft_phase_ptr: (a: number) => number;
    readonly wasmfft_process: (a: number) => void;
    readonly wasmfft_process_db: (a: number, b: number, c: number, d: number, e: number, f: any) => void;
    readonly wasmfft_set_input: (a: number, b: number, c: number) => void;
    readonly wasmfft_smooth_coherence: (a: number, b: number, c: number, d: number, e: any) => void;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
