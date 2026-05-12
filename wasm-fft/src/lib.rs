use wasm_bindgen::prelude::*;
use rustfft::{FftPlanner, Fft};
use num_complex::Complex;
use std::sync::Arc;

#[wasm_bindgen]
pub struct WasmFft {
    fft: Arc<dyn Fft<f32>>,
    input_buffer_l: Vec<Complex<f32>>,
    input_buffer_r: Vec<Complex<f32>>,
    magnitude_buffer: Vec<f32>,
    phase_buffer: Vec<f32>,
    coherence_buffer: Vec<f32>,
    pxx: Vec<f32>,
    pyy: Vec<f32>,
    pxy: Vec<Complex<f32>>,
    window_buffer: Vec<f32>,
    size: usize,
}

#[wasm_bindgen]
impl WasmFft {
    #[wasm_bindgen(constructor)]
    pub fn new(size: usize) -> WasmFft {
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(size);
        
        let mut window_buffer = vec![0.0; size];
        if size > 1 {
            let n_minus_1 = (size - 1) as f32;
            for i in 0..size {
                let n = i as f32;
                // Blackman window: 0.42 - 0.5 * cos(2*pi*n/(N-1)) + 0.08 * cos(4*pi*n/(N-1))
                window_buffer[i] = 0.42 - 0.5 * (2.0 * std::f32::consts::PI * n / n_minus_1).cos() + 0.08 * (4.0 * std::f32::consts::PI * n / n_minus_1).cos();
            }
        }

        WasmFft {
            fft,
            input_buffer_l: vec![Complex { re: 0.0, im: 0.0 }; size],
            input_buffer_r: vec![Complex { re: 0.0, im: 0.0 }; size],
            magnitude_buffer: vec![0.0; size],
            phase_buffer: vec![0.0; size],
            coherence_buffer: vec![0.0; size],
            pxx: vec![0.0; size],
            pyy: vec![0.0; size],
            pxy: vec![Complex { re: 0.0, im: 0.0 }; size],
            window_buffer,
            size,
        }
    }

    /// JS側から入力データ（Float32Array）を渡してセットする(Mono)
    pub fn set_input(&mut self, input_data: &[f32]) {
        self.set_stereo_input(input_data, input_data);
    }

    /// JS側からL/Rの入力データを渡してセットする(Stereo)
    pub fn set_stereo_input(&mut self, input_data_l: &[f32], input_data_r: &[f32]) {
        let len_l = self.size.min(input_data_l.len());
        let len_r = self.size.min(input_data_r.len());
        for i in 0..len_l {
            self.input_buffer_l[i] = Complex { re: input_data_l[i] * self.window_buffer[i], im: 0.0 };
        }
        for i in len_l..self.size {
            self.input_buffer_l[i] = Complex { re: 0.0, im: 0.0 };
        }
        for i in 0..len_r {
            self.input_buffer_r[i] = Complex { re: input_data_r[i] * self.window_buffer[i], im: 0.0 };
        }
        for i in len_r..self.size {
            self.input_buffer_r[i] = Complex { re: 0.0, im: 0.0 };
        }
    }

    /// FFTを実行し、振幅と位相、およびコヒーレンスを計算する
    pub fn process(&mut self, smoothing: f32) {
        let alpha = smoothing;
        let one_minus_alpha = 1.0 - alpha;

        self.fft.process(&mut self.input_buffer_l);
        self.fft.process(&mut self.input_buffer_r);

        for i in 0..self.size {
            let xl = self.input_buffer_l[i];
            let xr = self.input_buffer_r[i];

            self.magnitude_buffer[i] = xl.norm(); // Primary is L
            self.phase_buffer[i] = xl.im.atan2(xl.re);

            let pxx_inst = xl.norm_sqr();
            let pyy_inst = xr.norm_sqr();
            let pxy_inst = xl * xr.conj();

            self.pxx[i] = alpha * self.pxx[i] + one_minus_alpha * pxx_inst;
            self.pyy[i] = alpha * self.pyy[i] + one_minus_alpha * pyy_inst;
            self.pxy[i] = Complex { 
                re: alpha * self.pxy[i].re + one_minus_alpha * pxy_inst.re,
                im: alpha * self.pxy[i].im + one_minus_alpha * pxy_inst.im,
            };

            let denom = self.pxx[i] * self.pyy[i];
            if denom > 1e-12 {
                self.coherence_buffer[i] = self.pxy[i].norm_sqr() / denom;
            } else {
                self.coherence_buffer[i] = 0.0;
            }
        }
    }

    /// マグニチュード（振幅）バッファのポインタを取得
    pub fn magnitude_ptr(&self) -> *const f32 {
        self.magnitude_buffer.as_ptr()
    }

    /// フェーズ（位相）バッファのポインタを取得
    pub fn phase_ptr(&self) -> *const f32 {
        self.phase_buffer.as_ptr()
    }

    /// コヒーレンスバッファのポインタを取得
    pub fn coherence_ptr(&self) -> *const f32 {
        self.coherence_buffer.as_ptr()
    }
}
