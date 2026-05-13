/* tslint:disable */
/* eslint-disable */

export class WasmFft {
    free(): void;
    [Symbol.dispose](): void;
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
    /**
     * JS側から入力データ（Float32Array）を渡してセットする
     */
    set_input(input_data: Float32Array): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmfft_free: (a: number, b: number) => void;
    readonly wasmfft_magnitude_ptr: (a: number) => number;
    readonly wasmfft_new: (a: number) => number;
    readonly wasmfft_phase_ptr: (a: number) => number;
    readonly wasmfft_process: (a: number) => void;
    readonly wasmfft_set_input: (a: number, b: number, c: number) => void;
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
